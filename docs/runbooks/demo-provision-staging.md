# Staging runbook — `open-demo-account` Edge (B2)

**Scope:** controlled staging soak only.  
**Not authorized:** production enablement, public traffic without Turnstile, merge to
`main`, or destructive demo reset.

## Preconditions

1. PR #400 (B1) merged to `dev` and applied to the **staging** Supabase project.
2. PR #401 (B2) retargeted to `dev`, full CI green, merged to `dev`.
3. Staging secrets available via the usual ops path (`docs/runbooks/supabase-operations.md`).
4. Cloudflare Turnstile site + secret created for staging hostname.

## 1. Migrations

When local ops credentials are unavailable, the existing **Deploy staging**
workflow also accepts a manual candidate run using the GitHub `Staging`
environment's secrets. It accepts only `dev` or `codex/jakstoimy-1-4-demo-ui`,
requires the exact expected SHA and current `dev` ancestry, and runs the normal
quality/RLS/E2E gates before accessing staging. The project ref must equal
`nveyzxxnyccpnesebvuw`; the Pages build and smoke URL must use that same project.

```bash
gh workflow run deploy-staging.yml --ref codex/jakstoimy-1-4-demo-ui \
  -f expected_sha=<FULL_REVIEWED_SHA> -f operation=preview
```

`preview` links staging and prints the migration dry run; it does not apply SQL,
deploy functions, seed personas, or publish Pages. Review that run before using
the same command with `operation=prepare`. Preparation applies the reviewed
migrations/system seed, deploys the demo Edge function with its kill switch
forced **false** and Turnstile required, and publishes the candidate UI to the
existing staging hostname. Manual preparation does not reseed user personas,
deploy unrelated Edge functions, merge the PR or enable demo provisioning.
Real Siteverify and the controlled soak still require a separate test window.

From a clean ops checkout linked to **staging** (never production):

```bash
./scripts/supabase-ops.sh staging push-preview
# After review:
./scripts/supabase-ops.sh staging push --confirm staging
```

Confirm these timestamps are present:

- `20261018180000_demo_identity_guards`
- `20261018184500_demo_identity_invitation_cleanup_guards`
- `20261018200000_demo_provision_limits`
- `20261018210000_demo_provision_reservations`
- `20261018213000_demo_provision_reservation_renew`
- `20261018220000_demo_provision_unconfirmed_orphans`
- `20261019120000_demo_identity_allow_revoke_targets`
- `20261019190143_demo_provision_durable_operations`
- `20261021111924_demo_cleanup_confirmed_identity`
- `20261021112347_demo_commit_identity_immutable`

## 2. Edge deploy (staging only)

```bash
# Kill switch MUST stay false until secrets/Turnstile are ready
supabase functions deploy open-demo-account --project-ref <STAGING_REF>
```

Do not deploy this function to the production project. The generic function
dispatcher and staging workflow do not deploy this provisioner automatically.
Deploy it only after separate staging approval and review of the current SHA.

## 3. Environment / secrets (staging)

| Secret / env | Staging value |
| --- | --- |
| `DEMO_PROVISION_ENABLED` | `false` until soak start, then `true` only for the soak window |
| `DEMO_PROVISION_REQUIRE_TURNSTILE` | `true` |
| `DEMO_TURNSTILE_SECRET` | staging Turnstile secret |
| `DEMO_PROVISION_RATE_WINDOW_SECONDS` | `7200` |
| `DEMO_PROVISION_RATE_MAX` | `3` (one shared bucket for the entire test) |
| `DEMO_PROVISION_GLOBAL_MAX_ACTIVE` | `3`; require a zero baseline before this test |
| `DEMO_PROVISION_HOLD_SECONDS` | `180` |
| `DEMO_PROVISION_CLIENT_SALT` | unique staging salt |
| `DEMO_PROVISION_TRUSTED_IP_HEADER` | **leave unset** |
| `DEMO_SOAK_STARTED_AT` | agreed start, UTC ISO timestamp |
| `DEMO_SOAK_EXPIRES_AT` | UTC ISO timestamp, at most 60 minutes after start |
| `APP_ORIGINS` | staging app origin(s) |

## 4. Soak test — open demo account

The staging handler requires a valid server lease and the exact bounded settings
above, even when `DEMO_PROVISION_ENABLED=true`. Missing, future, expired or
overlong leases fail closed. It rechecks expiry after Siteverify, before Auth
creation and before returning credentials. This deadline is enforced per request
by Edge; it needs no live workflow, timer or operator callback. In-flight Auth
requests may still finish after the deadline; retain their journal and drain them.

The existing SQL advisory lock serializes shared-bucket claims. A two-hour rate
window with maximum three claims limits this one-hour soak to **three attempts
that can start Auth**, across all clients. Cleanup/release does not erase attempt
history, so it cannot replenish this budget. Do not change the salt, clear
attempts, set a trusted IP header or extend/restart the lease during the test.
The active-account cap is an additional bound, not the cumulative budget.

Before enabling, deploy the reviewed handler with the switch **false**, verify
the baseline and current SHA, and obtain the human operator's readiness if they
will complete the real challenge. Do not use Cloudflare test keys or automate
challenge bypass. If a browser cannot complete a real challenge, leave the
window unopened and report that part as blocked.

The lease automatically disables provisioning, but does **not** rewrite the
Management API secret to `false`. The operator/test runner must still restore
that secret in its final cleanup, including after a cancelled run; confirm both
the secret update and an actual `503 demo_provision_disabled` response. A
workflow `always()` cleanup alone is not the independent cutoff.

1. Set the agreed timestamps and bounded settings while disabled; verify them,
   then set `DEMO_PROVISION_ENABLED=true` on staging Edge only.
2. From the staging app (or a local client pointed at staging Edge):
   - Complete Turnstile
   - `POST /functions/v1/open-demo-account` with `{}` and a fresh
     `x-turnstile-token` header (or `{ turnstileToken }` body; never email/userId)
3. Expect `200` + `{ userId, email, tokenHash, verifyType: "email" }` — **no** session JWT.
4. Client `verifyOtp({ token_hash, type: "email" })` → session for that UID.
5. Confirm `is_demo_account(uid)` and registry row; confirm `create_group` → `demo_not_allowed`.
6. Confirm logs contain **no** `tokenHash` / magic-link URLs.

Do not run the old five-account parallel smoke during the three-attempt window.
Verify concurrency/failure injection on the isolated local stack first. For the
real staging budget check, after three admitted claims, a fresh valid challenge
must produce cap/rate rejection without another Auth account. Negative challenge
tests must not consume a claim. Baseline must include unresolved operations and
orphans as well as registry; do not infer it from registry alone.

Before the 60-minute controlled soak, record SHA, staging project/hostname,
operator, time window in Europe/Warsaw, baseline and maximum new-account budget.
Monitor every 5 minutes. At low traffic verify one-time token consumption, demo
isolation, blocked group/admin operations, shared-bucket 429 and cap 503 responses.
Missing/invalid/replayed Turnstile must never create an account. Run destructive
fault injection only against an isolated local stack, including Auth read +
ledger failure and concurrent cap=1 after creating-operation expiry.

Stop immediately on credential leakage, isolation failure, excess Auth accounts,
or unexplained operation growth. Record aggregate counts/statuses, never
request bodies, email OTPs, token hashes, magic links, or session/service keys.

## 5. Disable after soak

1. Set `DEMO_PROVISION_ENABLED=false` (or remove the secret) immediately after the window.
2. Redeploy or update secrets so the function returns `503 demo_provision_disabled`.
3. Leave migrations and the operation journal in place; do not drop tables.
4. Drain requests started before disabling; the switch does not atomically cancel
   them or revoke existing sessions. Recheck counts after the pre-Auth hold TTL.

## 6. Monitoring

Watch during soak:

- Edge error rate / `provision_failed` / `rate_limited` / `capacity_exhausted` / `automation_rejected`
- Growth of `demo_identities` and `demo_provision_reservations` (held, creating, committed)
- `demo_provision_orphans` rows, especially `kind = unconfirmed_auth_read`

Alert on any unresolved creating operation or orphan beyond the reconciliation
window. A failed ledger write still leaves the pre-Auth operation journal and
emits `demo_provision_reconciliation_required` with its reservation ID. Treat
that event as actionable even if the orphan table is empty.

## 7. Orphan reconciliation (safe)

### Persistent staging availability

An explicitly approved persistent staging environment can set
`DEMO_STAGING_ALWAYS_ENABLED=true` on **portfelik-staging only**. This replaces
the lease requirement, not the master kill switch or safeguards. Turnstile,
shared 3-attempt/7200-second rate limit and global capacity 3 remain required.
Never set this flag on production. Disable the previous window's monitor and
scheduled cutoff before switching modes. A persistent environment is not a
completed 60-minute controlled soak. `DEMO_PROVISION_ENABLED=false` still stops
provisioning immediately. Record effective occupied capacity, including
unrepresented creating/committed operations and orphans, rather than Auth count
alone. Reconcile only already-bound absent identities using the guarded RPC.

Direct Auth Dashboard deletion bypasses `delete_account()` and can fail on
the import aggregate's intentional RESTRICT foreign keys. Use the existing
account-deletion procedure, which deletes private import leaves before parents
and preserves shared custody. Do not weaken these foreign keys or delete import
history piecemeal to make Dashboard deletion pass. Operator deletion of specific
test accounts needs an explicit reviewed scope and authorization.

Rows in `demo_provision_orphans`:

| `kind` | Meaning | Allowed action |
| --- | --- | --- |
| `owned_delete_failed` | Ownership was proven; `deleteUser` failed | Retry `getUserById`; delete **only** if email + nonce + `account_kind=demo` still match |
| `unconfirmed_auth_read` | `createUser` returned a UID but ownership was not proven | `getUserById`; if missing → delete ledger row only; if email+nonce+demo match invented values → optional deleteUser; if **any** mismatch → **never delete**, quarantine/escalate |

Never delete an Auth user from the ledger alone. Never trust client-supplied identity.

Example operator flow (service role, staging):

1. `select * from demo_provision_orphans where kind = 'unconfirmed_auth_read' order by created_at;`
2. For each `user_id`, Admin API `getUserById`.
3. Apply the table above; record outcome in the ops log. Before deleting a
   matching owned Auth user, call `confirm_demo_provision_identity` with the
   reservation ID and exact UID. It verifies the existing Auth row against
   journal email + account_kind + nonce and persists the UID. If that call fails,
   **do not delete or free the slot**. A subsequent different UID is rejected.
4. After **confirmed successful deletion of the owned UID**, call
   `complete_demo_provision_cleanup` with reservation ID and UID. It first requires a non-NULL persisted UID exactly matching the supplied UID,
   then verifies Auth absence and releases the operation plus its matching ledger
   entry. An operation with NULL UID cannot be completed, even after a 404 or TTL
   expiry. If the delete response was lost, only an already-bound identity whose
   absence is verified can be reconciled; never manufacture a binding after 404.
5. If createUser had an unknown outcome, keep the operation charged. Inspect
   journal email/nonce, find the candidate Auth UID using trusted admin access,
   re-confirm ownership, then perform cleanup. Never free it because TTL elapsed,
   the ledger write failed, or one lookup returned 404 while creation could still
   be in flight. No automatic release exists for unknown create outcomes.
6. Legacy creating rows without email/nonce are quarantined; investigate them
   manually under a separate reviewed reconciliation procedure. Do not invent
   ownership or delete Auth users based on an old reservation alone.
7. Review retention of attempts and terminal reservations without deleting the
   active rate window or unresolved operations. End used test sessions before
   removing accounts; deleting an Auth user alone does not instantly revoke JWTs.

## 8. Production

**Blocked** until a separate explicit approval. Production requires Turnstile,
reviewed caps, green staging soak, and a go/no-go decision — not this runbook alone.
