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

- Plany hub: net worth (D1), monthly surplus (D2), save/debt kinds, settlement, Belka scenarios.
- Couples G1/G2: co-owner RLS for plans, debt terms, and transactions; UI `canManagePlan()` gating.
- Privacy policy synced with product (groups, snapshots, export bundle, push).
- Account export includes `plan_debt_terms` + `financial_snapshot`.
- P1 plan `group_id` hijack hardening; P2 debt terms on plan edit.
- Security hardening migration `20260623000000` (privacy `search_path`, seed RPC revoke).
- Shopping lists retired → Plany ([#103](https://github.com/adrianghub/portfelik/issues/103) closed).

**Post-merge ops - completed 2026-06-08:**

1. Prod migrations through `20260624000000` applied (operator-verified).
2. Production deploy + smoke on `portfelik.adrianzinko.com` confirmed.
3. Layer 2 ops verify: `docs/runbooks/ops-access-lockdown.md` §1 stamped 2026-06-08.
4. `dev` synced with `main`; CI gates green (RLS 241, Playwright 54).
5. Trust hardening on `main`: ledger/forecast semantics, settlement policy, shared-tx UI gates ([#111](https://github.com/adrianghub/portfelik/pull/111)).

**Launch certified 2026-06-08.** This is the historical launch baseline; later
increments continue against the same production-readiness bar rather than this
document acting as a long-term work stop.

## Trust hardening certification (2026-06-08)

- RLS trust tests: `remove_group_member`, group tx delete, co-owner plan delete, lifecycle RPC denials.
- Group-role E2E: member readonly, co-owner edit, member settle.
- Scope polish: dashboard upcoming list, plans surplus filter, category combobox prefetch, seed FK cleanup.

## Production readiness cleanup (2026-06-28)

- Runtime copy no longer references pre-release posture or retired shopping-list i18n.
- Architecture docs reflect the current onboarding checklist, glossary, recurring skips, action dismissals, and derived cash-position model.
- Operational privacy docs use production onboarding language; pre-release notes stay only where they document historical decisions.

## Deferred (post-launch / V1+)

These are intentionally not pre-production blockers. See
[future product paths](./future-paths.md) for sequencing and prerequisites.

- Manual emergency transaction fallback from a plan detail screen.
- Dexie offline write outbox / durable offline writes.
- Split allocations across plans/categories.
- Deeper automation around recurring rows, rules, and settlement.
- Quiet gamification around imports, settlement, savings, and debt payoff.
- AI explanations, summaries, keyword proposals, and suggested plans.
- Debt, savings, and credit workflows.
- Privacy Layer 3 selective column encryption.

## Verification Baseline

Before promoting to production (`dev` → `main`):

- `pnpm exec svelte-check --tsconfig ./tsconfig.json`
- `pnpm lint`
- `pnpm format:check`
- RLS suite + staging smoke + focused Playwright on touched flows
- changed-file secret scan from `CLAUDE.md`
- Production privacy readiness checklist in `docs/architecture/flows/admin-diagnostics-privacy.md`
