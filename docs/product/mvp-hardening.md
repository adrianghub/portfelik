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

## Public launch gate (Phase 5 — ready after commit + PR)

All MVP+ rows above are implemented in the local `dev` working tree (2026-06-05). Before `dev`→`main`:

- Commit the 8-commit split (see `CLAUDE.md` handoff).
- `supabase db reset` locally; RLS suite includes `plan_settlement.spec.ts`.
- `./scripts/open-pr.sh` (not dry-run) when CI green on the PR branch.

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
