# ADR 0003 — RLS-first design with SECURITY DEFINER RPCs for membership-managed tables

**Status:** Accepted (2026-04, Phase 1)

## Context

The migration moved from `firestore.rules` (a separate rules language) to Postgres RLS. Most tables map cleanly: a row has a `user_id`, the user can read/write their own row, the read side may be widened to group members through a join.

But three tables manage *membership itself*: `user_groups`, `group_members`, `group_invitations`. Direct table writes to these are dangerous because they have invariants no single-row policy can express:

- Only the owner can disband a group.
- Accepting an invitation must atomically (a) update the invitation status and (b) insert into `group_members`.
- Transferring ownership must move `owner_id` *and* keep the new owner in `group_members`.
- A user cannot be removed from a group if they are the owner.

A naive RLS policy ("user_id = auth.uid()") would let anyone insert themselves into any group. A more careful policy would still need a transaction the client cannot orchestrate.

A second, structural problem: RLS policies that read other tables can recurse. A `group_members` policy that says "you can read the roster if you are in this group" produces a self-join inside the policy itself, which Postgres evaluates per-row, which re-fires the policy, which loops.

## Decision

**RLS-first for owner-managed tables; SECURITY DEFINER RPCs for membership-managed tables.**

For `transactions`, `categories`, `shopping_lists`, `notifications`, `push_subscriptions`: standard RLS — caller's `user_id` for own rows, plus a group-membership self-join for shared reads.

For `user_groups`, `group_members`, `group_invitations`: **block direct writes** with `using (false) with check (false)`, and expose every legitimate mutation as a SECURITY DEFINER RPC that bypasses RLS and enforces invariants in plpgsql:

- `create_group`, `disband_group`, `transfer_group_ownership`, `remove_group_member`
- `invite_user`, `accept_invitation`, `reject_invitation`, `cancel_invitation`
- `leave_group`, `assign_admin_role`, `revoke_admin_role`

Two SECURITY DEFINER helpers (`is_group_member`, `is_group_owner`) are used inside RLS policies to break the self-recursion problem on `group_members` and `group_invitations`. Their internal queries bypass RLS, so the policy that calls them does not retrigger.

All `auth.uid()` calls in policies are wrapped in `(select auth.uid())` so Postgres evaluates them once per statement (initPlan), not once per row.

## Consequences

**Good**

- Invariants live in one place per operation (the RPC body) and are enforced by the database, not the client.
- Atomicity is automatic. `accept_invitation` updates the invitation and inserts into `group_members` in one transaction; partial failure rolls both back.
- Auditability. Every legitimate mutation is a named function with explicit parameters; reading the migration tells you the entire surface.
- The recursion fix (helpers + initPlan wrap) is verifiable in `EXPLAIN`.

**Bad**

- More code to write than "expose the table and trust RLS". Each new mutation is a plpgsql function plus a tiny client wrapper.
- The client cannot do partial introspection (e.g. "can I do this?" without trying). Introspection would mean re-implementing the RPC's preconditions in SQL or in TS.
- A bug in an RPC bypasses RLS by design; rigour matters.

**Neutral**

- Two helper functions (`is_group_member`, `is_group_owner`) need to exist and be SECURITY DEFINER. They are tiny and reviewed.

## Alternatives considered

- **All RLS, no RPCs.** Rejected: cannot express the atomic "update invitation status + insert membership" without giving the client the ability to insert into `group_members`, which is the exact thing we're trying to prevent.
- **All RPCs, no direct table reads.** Rejected: most reads are simple "own + group-shared", which RLS expresses cleanly. RPCs for reads would just re-implement PostgREST.
- **Application-layer authorisation in an Edge Function.** Rejected: introduces a server-side runtime we otherwise don't need, and re-creates the role-based-access logic outside the database. RLS keeps it in one place.
