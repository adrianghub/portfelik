# Group authorization matrix

Canonical rules for group-scoped financial data. Client helpers (`canManageTransaction`, `canManagePlan`) mirror RLS; settlement RPCs use a broader member gate by design.

## Roles

| Role | Source |
|------|--------|
| `owner` | `user_groups.owner_id`; synced on `group_members.role` |
| `co_owner` | Nominated by owner via `nominate_group_co_owner` |
| `member` | Default on join/invite claim |
| *(none)* | Left group or removed — no `group_members` row |

## Direct table writes (RLS)

| Resource | Private (no `group_id`) | Group — creator | Group — owner/co-owner | Group — member |
|----------|-------------------------|-----------------|------------------------|----------------|
| `transactions` update/delete | Creator | Creator **while member** | Any row in group | Read + settle via RPC only |
| `plans` update/delete | Creator | Creator **while member** | Any plan in group | Read only |
| `plan_debt_terms` | Via plan manager rules above | Same | Same | Read only |
| `recurring_occurrence_skips` insert | Creator | Creator **while member** | Co-owner path | — |

**Former members:** creators lose write access when `is_group_member` is false (migration `20260803010000`).

## Settlement RPCs (`link_plan_transaction`, `unlink_plan_transaction`, `add_plan_contribution`)

| Actor | Link/unlink/contribute |
|-------|------------------------|
| Plan creator | Yes if private; if group-scoped, **current member** only |
| Any current group member | Yes (group-scoped) |
| Former member (including creator) | No |

Settlement intentionally stays **member-wide** so any partner can settle shared goals/debt without admin rights.

## Group lifecycle (RPC-only)

| Action | Who |
|--------|-----|
| `create_group` | Authenticated user → becomes owner |
| `leave_group` | Members only; owners must transfer or disband |
| `remove_group_member` | Owner only |
| `nominate_group_co_owner` / `revoke_group_co_owner` | Owner only |
| `disband_group` | Owner only (blocked if plans/transactions reference group) |
| `transfer_group_ownership` | Owner only |

## Client UI gates

- **Manage transaction/plan** (edit, delete, debt terms): `canManageTransaction` / `canManagePlan` — creator requires `groupRoles.has(group_id)` for group rows.
- **Settle / link**: shown when member can see plan + eligible tx; RPC enforces membership.
