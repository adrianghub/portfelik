-- Ledger unconfirmed Auth creates (createUser ok, getUserById failed / ownership
-- unproven). Never delete from this row alone — reconciliation must re-read Auth
-- and match synthetic email + provision nonce + account_kind=demo.

alter table public.demo_provision_orphans
  add column if not exists kind text not null default 'owned_delete_failed';

alter table public.demo_provision_orphans
  drop constraint if exists demo_provision_orphans_kind_check;

alter table public.demo_provision_orphans
  add constraint demo_provision_orphans_kind_check
  check (kind in ('owned_delete_failed', 'unconfirmed_auth_read'));

comment on column public.demo_provision_orphans.kind is
  'owned_delete_failed: deleteUser failed after proven ownership. unconfirmed_auth_read: createUser returned a UID but ownership could not be proven — reconcile via Admin getUserById before any delete.';

create or replace function public.record_demo_provision_orphan(
  p_user_id uuid,
  p_email text,
  p_nonce text,
  p_error text default null,
  p_kind text default 'owned_delete_failed'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_kind text := coalesce(nullif(trim(p_kind), ''), 'owned_delete_failed');
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_user_id is null or coalesce(p_nonce, '') = '' then
    raise exception 'invalid_orphan' using errcode = 'P0001';
  end if;
  if v_email !~ '^[^@]+@demo\.jakstoimy\.local$' then
    raise exception 'invalid_orphan_email' using errcode = 'P0001';
  end if;
  if v_kind not in ('owned_delete_failed', 'unconfirmed_auth_read') then
    raise exception 'invalid_orphan_kind' using errcode = 'P0001';
  end if;

  insert into public.demo_provision_orphans (
    user_id, email, provision_nonce, last_cleanup_error, kind
  )
  values (
    p_user_id, v_email, p_nonce, left(coalesce(p_error, ''), 500), v_kind
  )
  on conflict (user_id) do update
    set last_cleanup_error = excluded.last_cleanup_error,
        provision_nonce = excluded.provision_nonce,
        email = excluded.email,
        kind = excluded.kind;
end;
$$;

revoke all on function public.record_demo_provision_orphan(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_demo_provision_orphan(uuid, text, text, text, text)
  to service_role;

-- Keep 4-arg overload for existing Edge callers (defaults kind).
create or replace function public.record_demo_provision_orphan(
  p_user_id uuid,
  p_email text,
  p_nonce text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.record_demo_provision_orphan(
    p_user_id, p_email, p_nonce, p_error, 'owned_delete_failed'
  );
end;
$$;

revoke all on function public.record_demo_provision_orphan(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_demo_provision_orphan(uuid, text, text, text)
  to service_role;
