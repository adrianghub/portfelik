-- Issue #81: support-safe admin diagnostics via keyed-HMAC pseudonymisation.
-- Pseudonymisation + masking, NOT anonymisation. Compute-on-read; no stored tokens.
-- The masked RPCs below are the ONLY deliberate admin cross-user financial path.
-- Do NOT add is_admin() bypass RLS policies on transactions / import tables.

-- ── 1. HMAC pepper in Vault (idempotent, every env; never committed) ──────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'privacy_pepper') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'privacy_pepper',
      'HMAC pepper for admin diagnostics pseudonymisation (issue #81)'
    );
  end if;
end $$;

-- ── 2. Internal-only privacy helpers ─────────────────────────────────────────
create or replace function privacy_hmac_token(p_value text, p_context text)
returns text
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_pepper text;
begin
  if p_value is null or btrim(p_value) = '' then
    return null;
  end if;
  if p_context not in ('user','merchant','group','category','email','import_source') then
    raise exception 'privacy_hmac_token: disallowed context %', p_context
      using errcode = '22023';
  end if;
  select decrypted_secret into v_pepper
    from vault.decrypted_secrets
   where name = 'privacy_pepper'
   limit 1;
  if v_pepper is null then
    raise exception 'privacy_hmac_token: privacy_pepper secret missing (fail closed)'
      using errcode = 'P0001';
  end if;
  return encode(
    extensions.hmac(p_context || ':' || lower(btrim(p_value)), v_pepper, 'sha256'),
    'hex'
  );
end $$;

create or replace function privacy_amount_bucket(p_amount numeric)
returns text language sql immutable as $$
  select case
    when p_amount is null then null
    when abs(p_amount) < 50 then '< 50 PLN'
    when abs(p_amount) < 200 then '50-200 PLN'
    when abs(p_amount) < 1000 then '200-1000 PLN'
    else '> 1000 PLN'
  end
$$;

create or replace function privacy_mask_email(p_email text)
returns text language sql immutable as $$
  select case
    when p_email is null or btrim(p_email) = '' then null
    when position('@' in p_email) = 0 then '[masked]'
    else left(p_email, 1) || '***@' || split_part(p_email, '@', 2)
  end
$$;

create or replace function privacy_mask_text(p_label text)
returns text language sql immutable as $$
  select case when p_label is null then null else '[masked]' end
$$;

revoke execute on function privacy_hmac_token(text, text)   from public, anon, authenticated, service_role;
revoke execute on function privacy_amount_bucket(numeric)   from public, anon, authenticated, service_role;
revoke execute on function privacy_mask_email(text)         from public, anon, authenticated, service_role;
revoke execute on function privacy_mask_text(text)          from public, anon, authenticated, service_role;

-- ── 3. Masked diagnostic RPC: transaction ─────────────────────────────────────
create or replace function admin_masked_transaction_by_id(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_tx          transactions%rowtype;
  v_merchant    text;
  v_source_kind text;
begin
  if not is_admin() then
    raise exception 'permission_denied: admin only' using errcode = '42501';
  end if;
  select * into v_tx from transactions where id = p_transaction_id;
  if not found then
    return null;
  end if;
  select r.counterparty, s.source_kind
    into v_merchant, v_source_kind
    from transaction_import_links l
    join transaction_import_rows r     on r.id = l.row_id
    join transaction_import_sessions s on s.id = l.session_id
   where l.transaction_id = p_transaction_id;
  return jsonb_build_object(
    'transaction_id',     v_tx.id,
    'user_token',         privacy_hmac_token(v_tx.user_id::text, 'user'),
    'group_token',        privacy_hmac_token(v_tx.group_id::text, 'group'),
    'category_token',     privacy_hmac_token(v_tx.category_id::text, 'category'),
    'type',               v_tx.type,
    'status',             v_tx.status,
    'date_month',         to_char(v_tx.date, 'YYYY-MM'),
    'amount_bucket',      privacy_amount_bucket(v_tx.amount),
    'currency',           v_tx.currency,
    'description_masked', privacy_mask_text(v_tx.description),
    'merchant_token',     privacy_hmac_token(v_merchant, 'merchant'),
    'source_kind',        v_source_kind,
    'created_at',         v_tx.created_at
  );
end $$;

grant execute on function admin_masked_transaction_by_id(uuid) to authenticated;

-- ── 4. Masked diagnostic RPC: import session ──────────────────────────────────
create or replace function admin_masked_import_session_by_id(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_s     transaction_import_sessions%rowtype;
  v_label text;
begin
  if not is_admin() then
    raise exception 'permission_denied: admin only' using errcode = '42501';
  end if;
  select * into v_s from transaction_import_sessions where id = p_session_id;
  if not found then
    return null;
  end if;
  select label into v_label from bank_accounts where id = v_s.bank_account_id;
  return jsonb_build_object(
    'session_id',          v_s.id,
    'user_token',          privacy_hmac_token(v_s.user_id::text, 'user'),
    'adapter_kind',        coalesce(v_s.adapter_kind, v_s.detected_kind),
    'source_kind',         v_s.source_kind,
    'status',              v_s.status,
    'source_label_masked', privacy_mask_text(v_label),
    'rows_total',          v_s.rows_total,
    'rows_committed',      v_s.rows_committed,
    'rows_skipped',        v_s.rows_skipped,
    'rows_duplicate',      v_s.rows_duplicate,
    'created_at',          v_s.created_at,
    'committed_at',        v_s.committed_at
  );
end $$;

grant execute on function admin_masked_import_session_by_id(uuid) to authenticated;

-- ── 5. Masked diagnostic RPC: user context ────────────────────────────────────
create or replace function admin_masked_user_context_by_id(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_email       text;
  v_name        text;
  v_role        text;
  v_created     timestamptz;
  v_group_count int;
begin
  if not is_admin() then
    raise exception 'permission_denied: admin only' using errcode = '42501';
  end if;
  select email, name, role, created_at
    into v_email, v_name, v_role, v_created
    from profiles where id = p_user_id;
  if v_role is null then
    return null;
  end if;
  select count(*) into v_group_count from group_members where user_id = p_user_id;
  return jsonb_build_object(
    'user_token',          privacy_hmac_token(p_user_id::text, 'user'),
    'email_masked',        privacy_mask_email(v_email),
    'display_name_masked', privacy_mask_text(v_name),
    'role',                v_role,
    'group_count',         v_group_count,
    'created_at',          v_created
  );
end $$;

grant execute on function admin_masked_user_context_by_id(uuid) to authenticated;

-- ── 6. Lockdown: mask admin notification diagnostics ──────────────────────────
drop function if exists fetch_admin_notifications(int);

create or replace function fetch_admin_notifications(p_limit int default 50)
returns table (
  id         uuid,
  user_token text,
  type       text,
  title      text,
  body       text,
  read_at    timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
begin
  if not is_admin() then
    raise exception 'permission_denied: admin only' using errcode = '42501';
  end if;
  return query
    select n.id,
           privacy_hmac_token(n.user_id::text, 'user'),
           n.type::text,
           privacy_mask_text(n.title),
           privacy_mask_text(n.body),
           n.read_at,
           n.created_at
      from notifications n
     order by n.created_at desc
     limit greatest(p_limit, 1);
end $$;

grant execute on function fetch_admin_notifications(int) to authenticated;

-- ── 7. Lockdown: admin RPCs are authenticated-only ────────────────────────────
-- These RPCs are created after 20260529000000_function_execute_hardening.sql, so
-- the global hardening pass does not cover them. They keep Supabase's default
-- public/anon EXECUTE grant. The is_admin() guard already blocks data leakage,
-- but anon/public should not be able to invoke them at all (lockdown convention).
revoke execute on function admin_masked_transaction_by_id(uuid)    from public, anon;
revoke execute on function admin_masked_import_session_by_id(uuid) from public, anon;
revoke execute on function admin_masked_user_context_by_id(uuid)   from public, anon;
revoke execute on function fetch_admin_notifications(int)          from public, anon;
