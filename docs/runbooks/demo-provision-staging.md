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
| `DEMO_PROVISION_RATE_WINDOW_SECONDS` | `60` |
| `DEMO_PROVISION_RATE_MAX` | `30`–`60` (shared bucket) |
| `DEMO_PROVISION_GLOBAL_MAX_ACTIVE` | low soak cap (e.g. `50`) |
| `DEMO_PROVISION_HOLD_SECONDS` | `180` |
| `DEMO_PROVISION_CLIENT_SALT` | unique staging salt |
| `DEMO_PROVISION_TRUSTED_IP_HEADER` | **leave unset** |
| `APP_ORIGINS` | staging app origin(s) |

## 4. Soak test — open demo account

1. Set `DEMO_PROVISION_ENABLED=true` on staging Edge.
2. From the staging app (or a local client pointed at staging Edge):
   - Complete Turnstile
   - `POST /functions/v1/open-demo-account` with `{}` and a fresh
     `x-turnstile-token` header (or `{ turnstileToken }` body; never email/userId)
3. Expect `200` + `{ userId, email, tokenHash, verifyType: "email" }` — **no** session JWT.
4. Client `verifyOtp({ token_hash, type: "email" })` → session for that UID.
5. Confirm `is_demo_account(uid)` and registry row; confirm `create_group` → `demo_not_allowed`.
6. Confirm logs contain **no** `tokenHash` / magic-link URLs.

Parallel smoke: 5 concurrent opens, each with a fresh valid Turnstile token,
with global cap `baseline+1` → only one success. Baseline must include unresolved
operations/orphans as well as registry; do not infer it from registry alone.

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

Rows in `demo_provision_orphans`:

| `kind` | Meaning | Allowed action |
| --- | --- | --- |
| `owned_delete_failed` | Ownership was proven; `deleteUser` failed | Retry `getUserById`; delete **only** if email + nonce + `account_kind=demo` still match |
| `unconfirmed_auth_read` | `createUser` returned a UID but ownership was not proven | `getUserById`; if missing → delete ledger row only; if email+nonce+demo match invented values → optional deleteUser; if **any** mismatch → **never delete**, quarantine/escalate |

Never delete an Auth user from the ledger alone. Never trust client-supplied identity.

Example operator flow (service role, staging):

1. `select * from demo_provision_orphans where kind = 'unconfirmed_auth_read' order by created_at;`
2. For each `user_id`, Admin API `getUserById`.
3. Apply the table above; record outcome in the ops log.
4. After **confirmed successful deletion of the owned UID**, call
   `complete_demo_provision_cleanup` with reservation ID and UID. It verifies
   Auth absence and releases the operation plus its matching ledger entry.
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
