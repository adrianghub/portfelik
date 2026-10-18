# B1 — Trusted demo identity & server guards

**Status:** implemented in migrations `20261018180000_demo_identity_guards.sql` and
`20261018184500_demo_identity_invitation_cleanup_guards.sql`.  
**Not included:** public Edge `open-demo-account` (B2), session switch, reset, Anonymous Auth.

## Authority model

| Layer | Role |
| --- | --- |
| `public.demo_identities` | Source of truth for active demo UIDs (`retired_at is null`) |
| `auth.users.raw_app_meta_data.account_kind = 'demo'` | Durable belt-and-suspenders claim (Admin/`register_demo_identity` only) |
| Client `user_metadata` | Ignored for capability |

`assert_real_capable(uid)` is **fail-closed**: missing Auth user, lookup error, registry hit, or `account_kind=demo` → `demo_not_allowed`. Existing users without a registry row remain real-capable.

Either claim alone is enough to deny privileged actions. Registry ↔ `app_metadata` mismatch must never grant real capability (see RLS tests).

## Guarded RPCs (actor and/or target)

- `create_group`
- `claim_group_invitation`, `accept_invitation`
- `leave_group`, `disband_group`, `remove_group_member`
- `nominate_group_co_owner`, `revoke_group_co_owner`, `transfer_group_ownership`
- `assign_admin_role`, `revoke_admin_role` (+ `is_admin()` never true for demo)
- `invite_user`, `create_group_invitation_for_delivery` (actor + invitee email)
- `cancel_invitation`, `reject_invitation`, `delete_group_invitation` (cleanup; no membership elevation)

## Write-path audit (bypass check)

### Direct table writes

`user_groups`, `group_members`, and `group_invitations` use RLS policies
`…: no direct writes` with `qual = false` / `with_check = false` for authenticated
clients. Service role bypasses RLS by design (fixtures, Edge, Admin API) — not a
product path.

### Triggers

Triggers on these tables are notify / token-consume / `updated_at` / notification
cleanup only. None insert membership or ownership rows.

### SECURITY DEFINER writers

Membership or ownership mutations go through guarded RPCs (`create_group`,
`accept_invitation`, `claim_group_invitation`, `transfer_group_ownership`,
`leave_group`, `disband_group`, `remove_group_member`, co-owner nominate/revoke).
Invitation delivery and cleanup RPCs cannot create membership; delivery also
blocks demo invitee emails via `assert_invitee_email_not_demo`.

Financial `SECURITY DEFINER` paths (import commit, category assignment, account
delete) stay intentionally open for private demo finance and do not elevate
social/admin capability.

## Edge

- `send-group-invitation`: early `is_demo_account` deny for invite actors (SQL also denies).
- `send-push`: skip delivery for demo recipients.
- `sync-user-role`: refuse `role=admin` for demo; preserve `account_kind=demo`.

## Intentionally open for demo (private finance)

Import, transactions, categories/rules, plans, balance/snapshots, recurrence — owner-scoped paths without social elevation.

## B2 gate — orphan Auth after failed registration

B2 must treat `createUser` and `register_demo_identity` as a single provision
transaction from the caller's point of view:

1. Create Auth user with `app_metadata.account_kind=demo`.
2. Call `register_demo_identity(uid)` (registry row + metadata reinforce).
3. Re-read and verify **both** markers (`is_demo_account` / registry + metadata).
4. Only then issue a session (`generateLink` → `verifyOtp`).

If step 2 or 3 fails after a successful `createUser`:

- **Do not** return tokens or a session to the client.
- Delete the orphan Auth user (Admin API) or mark it for immediate cleanup.
- Surface a generic provision failure; never leave a half-registered UID that
  could later receive a session via password or magic link.

Fail-closed on missing registry alone is not enough for orphan safety: an orphan
with only `account_kind=demo` is still denied social RPCs, but B2 must not hand
out a usable session until registration is complete and verified.

## Residual for B2

1. Public `open-demo-account` Edge (createUser + register + verify before session).
2. Refuse `generateLink` for existing real emails inside the provisioner.
3. Rate limits, CAPTCHA/automation resistance, global demo capacity.
4. Dual Demo/Real session storage and cache isolation.
5. Broader Edge polish (`send-admin-summary` exclusion if needed).
6. Destructive reset / retention (separate approval).

## Tests

`apps/web-svelte/tests/rls/demo-identity-guards.spec.ts` — negative social/admin
paths (including hard `accept_invitation` fixture), registry ↔ metadata mismatch,
conversion without elevation, cross-UID isolation, real regression, fail-closed
missing UID, client cannot forge registry or group membership rows.
