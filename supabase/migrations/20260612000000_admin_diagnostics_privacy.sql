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
