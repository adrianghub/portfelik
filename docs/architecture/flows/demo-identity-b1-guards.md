# B1 — Trusted demo identity & server guards

**Status:** implemented in migration `20261018180000_demo_identity_guards.sql`.  
**Not included:** public Edge `open-demo-account` (B2), session switch, reset, Anonymous Auth.

## Authority model

| Layer | Role |
| --- | --- |
| `public.demo_identities` | Source of truth for active demo UIDs (`retired_at is null`) |
| `auth.users.raw_app_meta_data.account_kind = 'demo'` | Durable belt-and-suspenders claim (Admin/`register_demo_identity` only) |
| Client `user_metadata` | Ignored for capability |

`assert_real_capable(uid)` is **fail-closed**: missing Auth user, lookup error, registry hit, or `account_kind=demo` → `demo_not_allowed`. Existing users without a registry row remain real-capable.

## Guarded RPCs (actor and/or target)

- `create_group`
- `claim_group_invitation`, `accept_invitation`
- `leave_group`, `disband_group`, `remove_group_member`
- `nominate_group_co_owner`, `revoke_group_co_owner`, `transfer_group_ownership`
- `assign_admin_role`, `revoke_admin_role` (+ `is_admin()` never true for demo)
- `invite_user`, `create_group_invitation_for_delivery` (actor + invitee email)

## Edge

- `send-group-invitation`: early `is_demo_account` deny for invite actors (SQL also denies).
- `send-push`: skip delivery for demo recipients.
- `sync-user-role`: refuse `role=admin` for demo; preserve `account_kind=demo`.

## Intentionally open for demo (private finance)

Import, transactions, categories/rules, plans, balance/snapshots, recurrence — owner-scoped paths without social elevation.

## Residual for B2

1. Public `open-demo-account` Edge (createUser + generateLink hashed_token + register before session).
2. Refuse `generateLink` for existing real emails inside the provisioner.
3. Rate limits, CAPTCHA/automation resistance, global demo capacity.
4. Dual Demo/Real session storage and cache isolation.
5. Broader Edge polish (`send-admin-summary` exclusion if needed).
6. Destructive reset / retention (separate approval).

## Tests

`apps/web-svelte/tests/rls/demo-identity-guards.spec.ts` — negative social/admin paths, conversion without elevation, cross-UID isolation, real regression, fail-closed missing UID, client cannot forge registry rows.
