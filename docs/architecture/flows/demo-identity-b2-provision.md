# B2 — Demo account provisioner (prep)

**Status:** Edge handler + durable reservations on `codex/jakstoimy-1-4-demo-b2` (PR #401).  
**Ship gate:** do **not** deploy Edge publicly; keep `DEMO_PROVISION_ENABLED` unset/false
until a separate approval after review.

Depends on B1 (`demo_identities`, `register_demo_identity`, `assert_real_capable`).

## Contract

1. Turnstile when `DEMO_TURNSTILE_SECRET` is set **or**
   `DEMO_PROVISION_REQUIRE_TURNSTILE=true`.
2. `claim_demo_provision_slot` → reservation id. Capacity =
   `active demo_identities + held unexpired reservations`.
3. Invent synthetic email + `demo_provision_nonce` (never accept caller identity).
4. `createUser` → required `getUserById` ownership (no createUser fallback).
5. `renew_demo_provision_reservation` before registry/link — if the hold expired
   during Auth latency, fail closed (cleanup + release) so a concurrent claim
   cannot be oversubscribed.
6. `register` → verify → `generateLink` → `commit`. **Any commit failure refuses
   the token** and cleans up the owned identity.
7. Response: `{ userId, email, tokenHash, verifyType: "email" }` only.

## Client identity / rate keys

Supabase Edge does **not** document a trusted client IP for functions. Default:

- Rate-limit key = shared bucket (`shared`) — IP-independent.
- Spoofable headers (`x-forwarded-for`, `x-real-ip`, …) never create new buckets.
- Global capacity is independent of IP.
- Do **not** enable `DEMO_PROVISION_TRUSTED_IP_HEADER` without verified ingress.

### Availability note (shared bucket)

A shared per-minute budget is safe against spoofing but can rate-limit unrelated
users. That is an availability trade-off, not a security hole. Mitigations:

| Environment | Rate window | `DEMO_PROVISION_RATE_MAX` | Turnstile | Notes |
| --- | --- | --- | --- | --- |
| Local | 60s | 50+ | off | Integration tests |
| Staging | 60s | 30–60 | recommended | Soak with kill switch on |
| Production (recommended) | 60s | 20–40 shared | **required** | Rely on Turnstile + global cap; no unverified IP keys |

Production must set `DEMO_PROVISION_REQUIRE_TURNSTILE=true` and
`DEMO_TURNSTILE_SECRET`. Raise the shared budget only after observing staging
abuse/availability metrics — never by trusting client IP headers.

## Safe cleanup / orphans

`deleteUser` only after `getUserById` re-confirms email + nonce + `account_kind=demo`.
Delete failures → `record_demo_provision_orphan`.

## Env

| Variable | Role |
| --- | --- |
| `DEMO_PROVISION_ENABLED` | Kill switch (default off) |
| `DEMO_PROVISION_RATE_*` | Shared-bucket window (default key = shared) |
| `DEMO_PROVISION_GLOBAL_MAX_ACTIVE` | Active demos + held reservations |
| `DEMO_PROVISION_HOLD_SECONDS` | Reservation TTL (default 180) |
| `DEMO_PROVISION_TRUSTED_IP_HEADER` | Leave empty unless ingress verified |
| `DEMO_PROVISION_REQUIRE_TURNSTILE` / `DEMO_TURNSTILE_SECRET` | Automation gate |

## Tests

- Unit: expiry renew failure, commit failure → no token, header spoof → shared key
- Integration: parallel cap, **expired hold + second claim under cap=1**, verifyOtp

## Migrations

- `20261018200000_demo_provision_limits.sql` — attempts + orphans
- `20261018210000_demo_provision_reservations.sql` — holds + claim/commit/release
- `20261018213000_demo_provision_reservation_renew.sql` — renew/assert hold
