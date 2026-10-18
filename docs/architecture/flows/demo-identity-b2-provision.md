# B2 — Demo account provisioner (prep)

**Status:** code skeleton + unit tests on branch `codex/jakstoimy-1-4-demo-b2`.  
**Ship gate:** do **not** deploy Edge to staging/production, do **not** set
`DEMO_PROVISION_ENABLED=true` on public hosts, do **not** merge to `main`
without a separate approval after B1 acceptance.

Depends on B1 (`demo_identities`, `register_demo_identity`, `assert_real_capable`).

## Contract

1. Invent synthetic email `demo+<uuid>@demo.jakstoimy.local` (never accept caller email/user id).
2. Admin `createUser` with `app_metadata.account_kind=demo`.
3. `register_demo_identity(uid)`.
4. Verify `is_demo_account(uid) === true`.
5. Only then `generateLink({ type: "magiclink", email })` for that same email.
6. Return `{ userId, email, tokenHash, verifyType: "email" }` for client
   `verifyOtp({ token_hash, type: "email" })`.

If steps 3–5 fail after `createUser`, delete the Auth user and return
`provision_failed`. Never return tokens for a half-registered identity.

`hashed_token` / `tokenHash` is a full session credential: never log, never put
in URLs, analytics, or error payloads.

## Local enablement

- Function: `supabase/functions/open-demo-account`
- Kill switch: `DEMO_PROVISION_ENABLED=true` (default disabled → HTTP 503)
- Rate window env: `DEMO_PROVISION_RATE_WINDOW_MS`, `DEMO_PROVISION_RATE_MAX`
  (in-process only; durable limits remain a ship prerequisite)

## Tests

- Unit: `apps/web-svelte/tests/unit/open-demo-account-handler.spec.ts`
- Session mechanism evidence: Auth PoC on PR #399
  (`experiments/demo-session-provision`,
  `docs/architecture/flows/demo-session-provision-poc.md`)

## Still before public ship

- Durable rate limits / CAPTCHA / global demo capacity
- UI “Otwórz konto demo” + Demo/Real session isolation
- Staging-only soak with `DEMO_PROVISION_ENABLED` before any production flag
- Abuse tests against invite-only Auth (no `generateLink` for existing real emails)
