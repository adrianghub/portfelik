-- B2: durable atomic demo provision rate/capacity + orphan ledger.
-- Service-role only. Clients cannot read or write these tables.

create table public.demo_provision_attempts (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  created_at timestamptz not null default now()
);

create index demo_provision_attempts_client_created_idx
  on public.demo_provision_attempts (client_key, created_at desc);

comment on table public.demo_provision_attempts is
  'Append-only provision attempt log for atomic per-client rate limits (service_role).';

create table public.demo_provision_orphans (
  user_id uuid primary key,
  email text not null,
  provision_nonce text not null,
  created_at timestamptz not null default now(),
  last_cleanup_error text null,
  constraint demo_provision_orphans_demo_email
    check (email like '%@demo.jakstoimy.local')
);

comment on table public.demo_provision_orphans is
  'Owned demo UIDs whose Auth delete failed after confirmed provision ownership. Never delete Auth users from here without re-confirming email+nonce.';

alter table public.demo_provision_attempts enable row level security;
alter table public.demo_provision_orphans enable row level security;

revoke all on table public.demo_provision_attempts from public, anon, authenticated;
revoke all on table public.demo_provision_orphans from public, anon, authenticated;
grant select, insert, delete on table public.demo_provision_attempts to service_role;
grant select, insert, update, delete on table public.demo_provision_orphans to service_role;

-- Atomic slot claim: global demo capacity + per-client window rate.
create or replace function public.claim_demo_provision_slot(
  p_client_key text,
  p_window_seconds integer default 60,
  p_max_per_window integer default 5,
  p_global_max_active integer default 500
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := left(trim(coalesce(p_client_key, '')), 128);
  v_window integer := greatest(coalesce(p_window_seconds, 60), 1);
  v_max integer := greatest(coalesce(p_max_per_window, 5), 1);
  v_global integer := greatest(coalesce(p_global_max_active, 500), 1);
  v_active bigint;
  v_recent bigint;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if v_key = '' then
    raise exception 'invalid_client_key' using errcode = 'P0001';
  end if;

  -- Serialize capacity + insert so parallel Edge isolates cannot overshoot.
  perform pg_advisory_xact_lock(hashtextextended('demo_provision_global', 0));

  select count(*) into v_active
  from public.demo_identities d
  where d.retired_at is null;

  if v_active >= v_global then
    raise exception 'demo_capacity_exhausted' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('demo_provision:' || v_key, 0));

  select count(*) into v_recent
  from public.demo_provision_attempts a
  where a.client_key = v_key
    and a.created_at >= now() - make_interval(secs => v_window);

  if v_recent >= v_max then
    raise exception 'demo_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.demo_provision_attempts (client_key)
  values (v_key);
end;
$$;

revoke all on function public.claim_demo_provision_slot(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_demo_provision_slot(text, integer, integer, integer)
  to service_role;

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
declare
  v_email text := lower(trim(coalesce(p_email, '')));
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

  insert into public.demo_provision_orphans (user_id, email, provision_nonce, last_cleanup_error)
  values (p_user_id, v_email, p_nonce, left(coalesce(p_error, ''), 500))
  on conflict (user_id) do update
    set last_cleanup_error = excluded.last_cleanup_error,
        provision_nonce = excluded.provision_nonce,
        email = excluded.email;
end;
$$;

revoke all on function public.record_demo_provision_orphan(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_demo_provision_orphan(uuid, text, text, text)
  to service_role;
