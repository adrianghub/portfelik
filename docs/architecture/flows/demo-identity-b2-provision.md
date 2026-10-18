# B2 — Demo account provisioner (prep)

**Status:** Edge handler + durable limits/reservations on `codex/jakstoimy-1-4-demo-b2` (PR #401).  
**Ship gate:** do **not** deploy Edge publicly; keep `DEMO_PROVISION_ENABLED` unset/false
until a separate approval after review.

Depends on B1 (`demo_identities`, `register_demo_identity`, `assert_real_capable`).

## Contract

1. Turnstile when `DEMO_TURNSTILE_SECRET` is set **or**
   `DEMO_PROVISION_REQUIRE_TURNSTILE=true`.
2. `claim_demo_provision_slot` returns a **reservation id**. Capacity =
   `active demo_identities + held unexpired reservations` under one advisory lock.
3. Invent synthetic email + `demo_provision_nonce` (never accept caller identity).
4. `createUser` → **required** `getUserById` ownership check (no fallback to the
   createUser payload on read failure).
5. `register_demo_identity` → verify → `generateLink` →
   `commit_demo_provision_reservation`. Failures `release` the hold and, when
   ownership was proven, may ownership-gated `deleteUser`.
6. Return `{ userId, email, tokenHash, verifyType: "email" }` only (never a session).

## Client identity / rate keys

Supabase Edge does **not** document a trusted, provider-controlled client IP
header visible to functions. Callers can supply `x-forwarded-for`, `x-real-ip`,
and often influence other forwarding headers.

Default behaviour:

- Rate-limit client key = shared bucket (`shared`), **IP-independent**.
- Spoofing `x-forwarded-for` / `x-real-ip` / `cf-connecting-ip` does not create
  a new bucket.
- Known-spoofable header names are refused even if mistakenly listed in
  `DEMO_PROVISION_TRUSTED_IP_HEADER`.
- Optional allowlist: only a non-spoofable header name may be configured after
  explicit infrastructure verification.
- Global capacity reservations do not depend on IP at all.
- Public ship should enable Turnstile (`DEMO_PROVISION_REQUIRE_TURNSTILE` + secret).

## Safe cleanup / orphans

`deleteUser` only after `getUserById` re-confirms email + nonce + `account_kind=demo`.
Delete failures → `record_demo_provision_orphan` (ledger only).

## Env

| Variable | Role |
| --- | --- |
| `DEMO_PROVISION_ENABLED` | Kill switch (default off) |
| `DEMO_PROVISION_RATE_*` | Per client-key window (default key = shared) |
| `DEMO_PROVISION_GLOBAL_MAX_ACTIVE` | Active demos + held reservations |
| `DEMO_PROVISION_HOLD_SECONDS` | Reservation TTL |
| `DEMO_PROVISION_TRUSTED_IP_HEADER` | Optional; empty = shared bucket |
| `DEMO_PROVISION_REQUIRE_TURNSTILE` / `DEMO_TURNSTILE_SECRET` | Automation gate |

## Tests

- Unit: ownership, no createUser fallback, header spoof → shared key, reservation release
- Integration: parallel claims at global cap 1, parallel handlers post-provision count,
  `handler → verifyOtp`, RLS on provision tables

## Migrations

- `20261018200000_demo_provision_limits.sql` — attempts + orphans
- `20261018210000_demo_provision_reservations.sql` — holds + claim/commit/release
