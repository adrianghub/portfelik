# MVP Hardening Checklist

This is the current stabilization checklist. Product doctrine lives in
[product-direction.md](./product-direction.md) and
[intent-oriented-ui.md](./intent-oriented-ui.md).

## Locked Product Direction

| Decision | Current direction |
| --- | --- |
| Product spine | Pulpit, Transakcje, Import, Plany, Ustawienia |
| Import | First-class structured intake; fast by default, exception review only |
| Transactions | Confirmed ledger; manual entries stay as fallback/corrections |
| Plans | User-facing evolution of current `shopping_lists` compatibility storage into future intent and goals |
| Plan settlement | Link plans to existing transactions; do not make plan-created transactions the default |
| Rules | Deterministic category rules before AI |
| AI | Explain, summarize, draft, suggest; never directly mutate financial truth |

## Current MVP Priorities

- Stabilize bank CSV import as the primary intake module.
- Keep duplicate detection and `Inne` fallback explainable.
- Make Plans copy consistent while internal `shopping_lists` names remain.
- Keep manual transaction creation/editing available but secondary.
- Preserve group/privacy boundaries for shared transactions, plans, and import
  provenance.
- Keep RLS tests and focused Playwright coverage around import, transactions,
  and plans.

## Deferred

- Full plan-to-transaction link model (`plan_transaction_links`).
- Deterministic plan matching with score/reasons/accepted/rejected state.
- Virtualized transaction and import review tables for very large datasets.
- Dexie offline write outbox.
- AI explanations, summaries, and keyword proposals.
- Debt, savings, and credit workflows.

## Verification Baseline

Before promoting MVP-facing changes:

- `pnpm exec svelte-check --tsconfig ./tsconfig.json`
- `pnpm lint`
- `pnpm format:check`
- focused unit/RLS tests for touched logic
- focused Playwright tests for touched user workflows
- changed-file secret scan from `CLAUDE.md`
