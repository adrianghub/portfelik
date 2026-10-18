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

## 2. Edge deploy (staging only)

```bash
# Kill switch MUST stay false until secrets/Turnstile are ready
supabase functions deploy open-demo-account --project-ref <STAGING_REF>
```

Do not deploy this function to the production project.

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
   - `POST /functions/v1/open-demo-account` with `{}` only (no email/userId)
3. Expect `200` + `{ userId, email, tokenHash, verifyType: "email" }` — **no** session JWT.
4. Client `verifyOtp({ token_hash, type: "email" })` → session for that UID.
5. Confirm `is_demo_account(uid)` and registry row; confirm `create_group` → `demo_not_allowed`.
6. Confirm logs contain **no** `tokenHash` / magic-link URLs.

Parallel smoke: 5 concurrent opens with global cap `baseline+1` → only one success.

## 5. Disable after soak

1. Set `DEMO_PROVISION_ENABLED=false` (or remove the secret) immediately after the window.
2. Redeploy or update secrets so the function returns `503 demo_provision_disabled`.
3. Leave migrations in place; do not drop tables.

## 6. Monitoring

Watch during soak:

- Edge error rate / `provision_failed` / `rate_limited` / `capacity_exhausted` / `automation_rejected`
- Growth of `demo_identities` and `demo_provision_reservations` (held)
- `demo_provision_orphans` rows, especially `kind = unconfirmed_auth_read`

Alert on any orphan row that is not cleared within the reconciliation window.

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
4. Clear the ledger row only after a safe terminal state.

## 8. Production

**Blocked** until a separate explicit approval. Production requires Turnstile,
reviewed caps, green staging soak, and a go/no-go decision — not this runbook alone.
