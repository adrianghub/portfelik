# B2 — Demo account provisioner (prep)

**Status:** Edge handler + durable reservations on `codex/jakstoimy-1-4-demo-b2` (PR #401).  
**Ship gate:** do **not** deploy Edge publicly; keep `DEMO_PROVISION_ENABLED` unset/false
until a separate approval after review.

Depends on B1 (`demo_identities`, `register_demo_identity`, `assert_real_capable`).

## Contract

1. Turnstile when `DEMO_TURNSTILE_SECRET` is set **or**
   `DEMO_PROVISION_REQUIRE_TURNSTILE=true`.
2. `claim_demo_provision_slot` → pre-Auth hold. Only this state may expire.
3. Invent synthetic email + nonce. `begin_demo_provision_operation` durably stores
   both and changes held → creating **before** calling Auth. An expired hold
   cannot start Auth. A creating operation never expires automatically.
4. `createUser` → required `getUserById` ownership (UID + email + account_kind +
   nonce; no createUser fallback). Unknown create/read outcomes retain capacity.
5. `commit_demo_provision_reservation` validates Auth ownership, calls
   `register_demo_identity`, and changes creating → committed atomically under
   the same global advisory lock as claims. Auth latency no longer frees a slot.
6. Verify `is_demo_account` → `generateLink`. Any error refuses the credential.
7. Response: `{ userId, email, tokenHash, verifyType: "email" }`, with no-store.

Capacity = active registry + pre-Auth holds + unresolved creating/committed
operations not represented by active registry + orphan ledger entries not
represented by either. A retired/missing registry row does not free a committed
operation while Auth may still exist. All unknown outcomes fail closed.

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

`deleteUser` only after `getUserById` re-confirms the exact UID, invented email,
nonce and `account_kind=demo`. Delete/read failures attempt the single
`record_demo_provision_orphan` API with explicit kind. Its optional fifth argument
also accepts legacy four-argument calls without an overload.

If even ledger writing fails, the operation journal still stores email/nonce and
holds capacity. A sanitized `demo_provision_reconciliation_required` event carries
only the reservation ID. It never carries Auth errors or credential material.

Only confirmed successful owned-user deletion may call
`complete_demo_provision_cleanup`; the DB checks both UID and email absence
before releasing capacity. Generic release/expiry cannot change creating or
committed operations. A read failure, timeout, or a single missing-user lookup
while createUser may still be in flight is not proof of cleanup.

Legacy held rows are conservatively migrated to creating, including expired
rows. Missing email/nonce must be reconciled manually before any capacity is
released. This may reduce availability; never reset the journal to bypass cap.

## Env

| Variable | Role |
| --- | --- |
| `DEMO_PROVISION_ENABLED` | Kill switch (default off) |
| `DEMO_PROVISION_RATE_*` | Shared-bucket window (default key = shared) |
| `DEMO_PROVISION_GLOBAL_MAX_ACTIVE` | Registry + holds + unresolved operations/orphans |
| `DEMO_PROVISION_HOLD_SECONDS` | Pre-Auth hold TTL only (default 180) |
| `DEMO_PROVISION_TRUSTED_IP_HEADER` | Leave empty unless ingress verified |
| `DEMO_PROVISION_REQUIRE_TURNSTILE` / `DEMO_TURNSTILE_SECRET` | Automation gate |

## Tests

- Unit: pre-Auth journal ordering, expired hold refusal, Auth read + ledger double
  failure, unknown create outcome, ownership mismatch, atomic commit refusal.
- Integration: real four/five-argument ledger calls after deleteUser failure;
  concurrent cap=1 with expired creating operation and failed cleanup; durable
  journal despite read+ledger failures; atomic commit ownership; RLS negatives;
  generateLink → verifyOtp and replay rejection.

## Migrations

- `20261018200000_demo_provision_limits.sql` — attempts + orphans
- `20261018210000_demo_provision_reservations.sql` — holds + claim/commit/release
- `20261018213000_demo_provision_reservation_renew.sql` — renew/assert hold

- `20261018220000_demo_provision_unconfirmed_orphans.sql` — unconfirmed orphan kind
- `20261019190143_demo_provision_durable_operations.sql` — single ledger API, durable
  pre-Auth journal, conservative legacy quarantine and atomic register/commit
