# MVP Hardening Checklist

Public launch program (2026-06). Product doctrine lives in
[product-direction.md](./product-direction.md) and
[intent-oriented-ui.md](./intent-oriented-ui.md).

## Locked Product Direction

| Decision | Current direction |
| --- | --- |
| Product spine | Pulpit, Transakcje, Import, Plany, Ustawienia |
| Import | First-class structured intake; fast by default, exception review only |
| Transactions | Confirmed ledger; manual entries stay as fallback/corrections |
| Plans | User-facing **Plany** on first-class `plans` storage with required date periods |
| Plan settlement | Link plans to existing income/expense transactions; do not make plan-created transactions the default |
| Rules | Deterministic category rules before AI |
| AI | Explain, summarize, draft, suggest; never directly mutate financial truth |
| Groups | Owner, co-owner, and member roles for group-scoped management |

## Recently completed (foundation on `dev`)

- Bank import exception-review surface (clean rows one-click commit, `pending` on explicit defer).
- Import review row virtualization (CHUNK_SIZE=60).
- Import adapter registry + user-selectable bank adapter.
- Import reminder alerts (7/14/30-day opt-in).
- Privacy Layer 1 masked admin diagnostics.
- Import combobox + `bank-import.ts` service/component tests; bank-import Playwright 19/19.

## Public launch gate (Phase 5 - **merged to `main` 2026-06-07**)

Shipped on `main` (`41717c7`):

- Plany hub: net worth (D1), monthly surplus (D2), save/debt/spend kinds, settlement, Belka scenarios.
- Couples G1/G2: co-owner RLS for plans, debt terms, and transactions; UI `canManagePlan()` gating.
- Privacy policy synced with product (groups, snapshots, export bundle, push).
- Account export includes `plan_debt_terms` + `financial_snapshot`.
- P1 plan `group_id` hijack hardening; P2 debt terms on plan edit.
- Security hardening migration `20260623000000` (privacy `search_path`, seed RPC revoke).
- Shopping lists retired → Plany ([#103](https://github.com/adrianghub/portfelik/issues/103) closed).

**Post-merge ops (before calling launch done):**

1. Apply pending migrations on **prod** Supabase (through `20260623000000`).
2. Confirm production Pages deploy + smoke on `portfelik.adrianzinko.com`.
3. **Layer 2 ops verify** (human): `docs/runbooks/ops-access-lockdown.md` §1 on prod project.
4. Sync `dev` from `origin/main`, run staging gates, push `dev`.
5. Re-run `get_advisors(security)` on prod; optional dashboard fixes (leaked-password, `pg_net`).

## Deferred (post-launch / V1+)

- Manual emergency transaction fallback from a plan detail screen.
- Dexie offline write outbox.
- AI explanations, summaries, and keyword proposals.
- Debt, savings, and credit workflows.
- Privacy Layer 3 selective column encryption.

## Verification Baseline

Before promoting to production (`dev` → `main`):

- `pnpm exec svelte-check --tsconfig ./tsconfig.json`
- `pnpm lint`
- `pnpm format:check`
- RLS suite + staging smoke + focused Playwright on touched flows
- changed-file secret scan from `CLAUDE.md`
- Public launch gate in `docs/architecture/flows/admin-diagnostics-privacy.md`
