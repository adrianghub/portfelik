-- Preserve household history when a non-owner group member deletes their
-- account. Group-scoped financial rows are retained under the group's owner as
-- their technical custodian; private rows and bank-import provenance are
-- erased with the departing account.

-- A recurring skip is household behavior, while created_by is attribution.
-- Keep the skip after its author leaves without retaining their user id.
alter table public.recurring_occurrence_skips
  alter column created_by drop not null;

alter table public.recurring_occurrence_skips
  drop constraint if exists recurring_occurrence_skips_created_by_fkey;

alter table public.recurring_occurrence_skips
  add constraint recurring_occurrence_skips_created_by_fkey
  foreign key (created_by)
  references auth.users(id)
  on delete set null;

comment on column public.recurring_occurrence_skips.created_by is
  'User who recorded the skip. Null after that account is deleted.';

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from auth.users where id = v_uid) then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.user_groups
    where owner_id = v_uid
  ) then
    raise exception 'has_owned_groups'
      using errcode = 'P0001',
            hint = 'Transfer ownership or disband all owned groups before deleting your account.';
  end if;

  -- Categories are private and transactions require one. Create/reuse an
  -- equivalent category for each destination custodian before transferring
  -- shared rows. This also handles one member contributing to multiple groups.
  insert into public.categories (name, type, user_id)
  select c.name, c.type, ug.owner_id
  from public.transactions t
  join public.user_groups ug on ug.id = t.group_id
  join public.categories c on c.id = t.category_id
  where t.user_id = v_uid
    and t.group_id is not null
  union
  select c.name, c.type, ug.owner_id
  from public.plans p
  join public.user_groups ug on ug.id = p.group_id
  join public.categories c on c.id = p.category_id
  where p.user_id = v_uid
    and p.group_id is not null
  on conflict do nothing;

  update public.transactions t
  set user_id = ug.owner_id,
      category_id = destination_category.id,
      updated_at = now()
  from public.user_groups ug,
       public.categories source_category,
       public.categories destination_category
  where t.user_id = v_uid
    and t.group_id is not null
    and ug.id = t.group_id
    and source_category.id = t.category_id
    and destination_category.user_id = ug.owner_id
    and lower(destination_category.name) = lower(source_category.name)
    and destination_category.type = source_category.type;

  update public.plans p
  set user_id = ug.owner_id,
      category_id = destination_category.id,
      updated_at = now()
  from public.user_groups ug,
       public.categories source_category,
       public.categories destination_category
  where p.user_id = v_uid
    and p.group_id is not null
    and p.category_id is not null
    and ug.id = p.group_id
    and source_category.id = p.category_id
    and destination_category.user_id = ug.owner_id
    and lower(destination_category.name) = lower(source_category.name)
    and destination_category.type = source_category.type;

  update public.plans p
  set user_id = ug.owner_id,
      updated_at = now()
  from public.user_groups ug
  where p.user_id = v_uid
    and p.group_id is not null
    and p.category_id is null
    and ug.id = p.group_id;

  update public.recurring_occurrence_skips s
  set user_id = ug.owner_id
  from public.user_groups ug
  where s.user_id = v_uid
    and s.group_id is not null
    and ug.id = s.group_id;

  if exists (
       select 1 from public.transactions where user_id = v_uid and group_id is not null
     )
     or exists (
       select 1 from public.plans where user_id = v_uid and group_id is not null
     )
     or exists (
       select 1
       from public.recurring_occurrence_skips
       where user_id = v_uid and group_id is not null
     )
  then
    raise exception 'shared_custody_transfer_failed'
      using errcode = 'P0001',
            hint = 'Account deletion was rolled back; resolve inconsistent group-scoped rows first.';
  end if;

  -- Import tables deliberately use RESTRICT between aggregate levels. Delete
  -- the private import aggregate from leaf to root; provenance never follows a
  -- shared transaction to its new custodian.
  delete from public.transaction_import_links l
  where l.user_id = v_uid
     or l.bank_account_id in (
       select a.id
       from public.bank_accounts a
       where a.user_id = v_uid
     )
     or l.session_id in (
       select s.id
       from public.transaction_import_sessions s
       where s.user_id = v_uid
          or s.bank_account_id in (
            select a.id
            from public.bank_accounts a
            where a.user_id = v_uid
          )
     )
     or l.row_id in (
       select r.id
       from public.transaction_import_rows r
       join public.transaction_import_sessions s on s.id = r.session_id
       where s.user_id = v_uid
          or s.bank_account_id in (
            select a.id
            from public.bank_accounts a
            where a.user_id = v_uid
          )
     );

  delete from public.transaction_import_rows r
  where r.session_id in (
    select s.id
    from public.transaction_import_sessions s
    where s.user_id = v_uid
       or s.bank_account_id in (
         select a.id
         from public.bank_accounts a
         where a.user_id = v_uid
       )
  );

  delete from public.transaction_import_sessions
  where user_id = v_uid
     or bank_account_id in (
       select id
       from public.bank_accounts
       where user_id = v_uid
     );
  delete from public.bank_accounts where user_id = v_uid;

  -- Remaining private rows use their declared ON DELETE actions. Attribution
  -- on shared settlement/recurrence audit rows becomes null.
  delete from auth.users where id = v_uid;
end;
$$;

comment on function public.delete_account() is
  'Deletes the caller account and private data. Shared transactions, plans, and recurring skips remain household history under the group owner, with departing-user attribution removed.';

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
