# B2 — Demo account provisioner (prep)

**Status:** Edge handler + durable limits on `codex/jakstoimy-1-4-demo-b2` (PR #401).  
**Ship gate:** do **not** deploy Edge to staging/production, do **not** set
`DEMO_PROVISION_ENABLED=true` on public hosts, do **not** merge to `main`
without a separate approval after B1 acceptance and B2 review.

Depends on B1 (`demo_identities`, `register_demo_identity`, `assert_real_capable`).

## Contract

1. Optional Turnstile when `DEMO_TURNSTILE_SECRET` is set (`automation_rejected` otherwise).
2. Atomic `claim_demo_provision_slot(client_key)` — per-client window rate + global
   active-demo capacity (Postgres advisory locks; works across Edge isolates).
3. Invent synthetic email `demo+<uuid>@demo.jakstoimy.local` and a
   `demo_provision_nonce` (never accept caller email/user id).
4. Admin `createUser` with `app_metadata.account_kind=demo` + nonce.
5. **Ownership gate:** confirm echoed email + `account_kind=demo` + nonce match.
   On mismatch → refuse token, **do not** `deleteUser`.
6. `register_demo_identity(uid)` then verify `is_demo_account`.
7. `generateLink({ type: "magiclink", email })` only for the owned email.
8. Return `{ userId, email, tokenHash, verifyType: "email" }` (never a session).

## Safe cleanup / orphans

`deleteUser` is allowed only for an `OwnedDemoIdentity` confirmed in this request,
and only after `getUserById` re-confirms the same email + nonce.

If delete fails after confirmed ownership, call `record_demo_provision_orphan`
(ledger only). A future sweeper may delete **only** rows that still match
`@demo.jakstoimy.local` + nonce + demo claim — never arbitrary UIDs from Auth errors.

## Local enablement

- Function: `supabase/functions/open-demo-account`
- Migration: `20261018200000_demo_provision_limits.sql`
- Kill switch: `DEMO_PROVISION_ENABLED=true` (default disabled → HTTP 503)
- Rate/capacity: `DEMO_PROVISION_RATE_WINDOW_SECONDS`, `DEMO_PROVISION_RATE_MAX`,
  `DEMO_PROVISION_GLOBAL_MAX_ACTIVE`, `DEMO_PROVISION_CLIENT_SALT`
- Automation: `DEMO_TURNSTILE_SECRET` (optional until ship)

## Logging

Never log `tokenHash`, `hashed_token`, access/refresh tokens, or magic-link URLs.
Error responses use opaque codes only (`provision_failed`, `rate_limited`, …).

## Tests

- Unit: `tests/unit/open-demo-account-handler.spec.ts` (ownership / no-delete-on-mismatch)
- Integration (local): `tests/rls/open-demo-account-provision.spec.ts`
  (slot RPC races, handler → verifyOtp, RLS on provision tables)

## Still before public ship

- Staging soak with kill switch + Turnstile
- Durable orphan sweeper job (ownership re-check only)
- UI “Otwórz konto demo” + Demo/Real session isolation
