-- Demo recurring occurrences are inserted by cron without is_demo. Clearing
-- the showcase must still remove them and their reminder notifications.
-- Account deletion must not leave the departing user's email on invitations.

update public.transactions occ
set is_demo = true
from public.transactions tmpl
where occ.recurring_template_id = tmpl.id
  and tmpl.is_demo
  and not occ.is_demo;

create or replace function public.inherit_demo_flag_from_template()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_demo boolean;
begin
  select t.is_demo
    into v_demo
  from public.transactions t
  where t.id = new.recurring_template_id;

  if found then
    new.is_demo := v_demo;
  end if;
  return new;
end;
$$;

drop trigger if exists inherit_demo_flag_from_template on public.transactions;
create trigger inherit_demo_flag_from_template
  before insert on public.transactions
  for each row
  when (new.recurring_template_id is not null)
  execute function public.inherit_demo_flag_from_template();

comment on function public.inherit_demo_flag_from_template() is
  'Occurrences inherit is_demo from their template so cron rows stay showcase-tagged.';

revoke all on function public.inherit_demo_flag_from_template() from public, anon, authenticated;

create or replace function public.clear_demo_data()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plans int := 0;
  v_txs int := 0;
  v_items int := 0;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  delete from public.notifications n
  where n.user_id = v_uid
    and n.data is not null
    and (
      n.data ->> 'templateId' in (
        select t.id::text
        from public.transactions t
        where t.user_id = v_uid
          and t.is_demo
      )
      or n.data ->> 'transactionId' in (
        select t.id::text
        from public.transactions t
        where t.user_id = v_uid
          and (
            t.is_demo
            or t.recurring_template_id in (
              select d.id
              from public.transactions d
              where d.user_id = v_uid
                and d.is_demo
            )
          )
      )
    );

  -- Plans first so debt terms and settlement links disappear through their FKs.
  with deleted as (
    delete from public.plans
    where user_id = v_uid
      and is_demo
    returning id
  )
  select count(*)::int into v_plans from deleted;

  -- Untagged cron occurrences of demo templates, then the tagged showcase rows.
  with demo_templates as (
    select id
    from public.transactions
    where user_id = v_uid
      and is_demo
  ),
  deleted as (
    delete from public.transactions
    where user_id = v_uid
      and (
        is_demo
        or recurring_template_id in (select id from demo_templates)
      )
    returning id
  )
  select count(*)::int into v_txs from deleted;

  with deleted as (
    delete from public.net_worth_items
    where user_id = v_uid
      and is_demo
    returning id
  )
  select count(*)::int into v_items from deleted;

  if not exists (
    select 1
    from public.net_worth_items
    where user_id = v_uid
  ) then
    delete from public.financial_snapshots where user_id = v_uid;
  end if;

  return jsonb_build_object(
    'plans', v_plans,
    'transactions', v_txs,
    'net_worth_items', v_items,
    'deleted', v_plans + v_txs + v_items
  );
end;
$$;

comment on function public.clear_demo_data() is
  'Atomically deletes every tagged showcase row owned by the caller, plus untagged occurrences, matching reminders, and an orphaned net-worth snapshot when no items remain.';

revoke all on function public.clear_demo_data() from public, anon;
grant execute on function public.clear_demo_data() to authenticated;

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
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

  select email into v_email from auth.users where id = v_uid;

  -- Invitations addressed to the departing user retain their email after
  -- invited_user_id is set null. Drop those rows so household members cannot
  -- keep the deleted account's address.
  delete from public.group_invitations
  where invited_user_id = v_uid
     or (v_email is not null and lower(invited_user_email) = lower(v_email));

  if v_email is not null then
    delete from public.group_invitation_access_attempts
    where lower(email) = lower(v_email);
  end if;

  update public.notifications
  set body = 'Ktoś zaprosił Cię do grupy "' || coalesce(data ->> 'groupName', '') || '"'
  where type = 'group_invitation'
    and data ->> 'invitedBy' = v_uid::text;

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
  'Deletes the caller account and private data, including invitations and access-attempt emails addressed to them. Shared transactions, plans, and recurring skips remain household history under the group owner, with departing-user attribution and inviter email removed from remaining notifications.';

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
