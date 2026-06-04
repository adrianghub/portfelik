# Admin Diagnostics Privacy

**This is pseudonymisation + masking, NOT anonymisation.** A record retrievable
by ID and tied to an account is not anonymous. The goal: make re-identification
impossible from the admin/support surface alone — not against a DB superuser or
a leaked pepper.

## Model

- Admins look up transactions, import sessions, and user context **by ID** via
  three `security definer` RPCs (`admin_masked_*`), each guarded by `is_admin()`.
- Correlation uses keyed HMAC tokens computed on-read: `privacy_hmac_token(value,
  context)` = `hex(hmac(context || ':' || lower(trim(value)), privacy_pepper,
  'sha256'))`. The pepper lives in Supabase Vault and never reaches the client.
- **Context separation:** fixed contexts (`user`, `merchant`, `group`,
  `category`, `email`, `import_source`) prevent the same string correlating
  across field types.
- Amounts are bucketed (`< 50 / 50-200 / 200-1000 / > 1000 PLN`); descriptions,
  names, labels are masked (`[masked]`); emails masked (`a***@domain`).
- `privacy_hmac_token` **fails closed**: it raises if the pepper is missing and
  rejects unknown contexts. Helper functions are revoked from all client roles
  (`public, anon, authenticated, service_role`) — callable only by the
  SECURITY DEFINER RPCs.

## Boundary

The masked RPCs are the only deliberate admin cross-user financial path. No
`is_admin()` bypass RLS exists on `transactions` / import tables. `fetch_admin_notifications`
is masked (title/body → `[masked]`) and returns `user_token`, not raw `user_id`.

## Threat model

In scope: stop routine admin/support UI from exposing raw financial/personal
data; make masked records irreversible without the pepper; allow by-ID debugging
+ stable pseudonymous correlation.

Out of scope: production DB superuser, leaked pepper, full client-side
encryption, reversible admin decryption.
