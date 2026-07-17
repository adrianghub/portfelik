# Review triage — 2026-07-13 whole-app findings

Source: external design/code review (20 findings). Verified items marked ✅;
each finding routed to an owner stream. Streams (user-approved order):
S1 Plans settlement flip → S3 onboarding/glossary copy → S2 groups audit →
S4 redundancy/cleanup. "Now" = standalone fix before/alongside S1.

| # | Finding | Verified | Route |
|---|---------|----------|-------|
| 1 | Group rows vanish: owner-only categories × inner join in `transactions_with_category` | ✅ total (all categories per-user; sole read policy `users read own`) | **S1 prerequisite** — view left-join fix, migration `20260801000000`, RLS regression test (spec rev 3 §0) |
| 2 | Group debts subtracted from private net worth, no group cash | ✅ | **S2 groups audit** — define private vs group net-worth ownership; S1 avoids extending it (goal assets private-only) |
| 3 | Admin digest stores exact per-user income/expense; privacy policy promises admin tooling hides amounts | ✅ (`send-admin-summary/index.ts:213-262` vs `docs/legal/privacy-policy.md:34`) | **Now** — strip `perUser` + exact totals from payload/notification; keep counts. Redeploy function. Pre-invite blocker |
| 4 | Save-contribution design accounting-blocked | stale — reviewed rev 1 | Closed by spec rev 2/3 (goal-asset decision, scoped conversion, rev 3 private-only scope) |
| 5 | Linked-tx integrity: type/status/period/scope drift post-link | partly | S1 locks `type` (trigger); status inert (progress counts `paid` only); period/scope drift documented out-of-scope; kind-flip harmless post-flip |
| 6 | Create-then-link non-atomic (dialog + debt plan+terms) | ✅ pre-existing | S1 quick-add uses atomic RPC; dialog path + debt create RPC → **S4** |
| 7 | Fragmented query invalidation; no key factories | plausible, unverified in detail | **S4** — central query-key factory + per-mutation invalidation helpers |
| 8 | `DashboardPlanProgress` calls debt balance with empty payments array | unverified | **S4** (quick win; verify `DashboardPlanProgress.svelte:48`) — partially masked today by finding 1 |
| 9 | Group join/leave doesn't invalidate financial queries | ✅ by inspection of `GroupsTab.svelte:140` claim (matches pattern) | **S2** |
| 10 | Prod deploy lacks migration-parity + function-promotion gate | plausible | **Ops backlog** — add parity check to `deploy-production.yml` |
| 11 | `plan_settlement_dismissals` cross-scope pairs | unverified | **S2/DB pass** |
| 12 | `recurring_occurrence_skips` scope unverified | unverified | **S4/DB pass** |
| 13 | Refinance lineage client-mutable / cycle-prone | unverified; refinance UI deferred (2026-06-29 YAGNI pass) | **S4/DB pass** — low priority, feature shelved |
| 14 | `plan_transaction_links.created_by` no ON DELETE → account deletion blocked | ✅ by schema read | **S2** (touches groups + account deletion path) |
| 15 | Category owner/type vs tx owner/type not DB-enforced; kind vs debt-terms | ✅ (conventions only) | **S4/DB pass**; S1's RPC enforces caller-owned Cele for contributions |
| 16 | UTC vs local "today" mix (dialog `toISOString`) | ✅ known class (see `getDateRangeBounds` fix 2026-07-04) | **S4** — sweep remaining `toISOString().slice(0,10)` on user-facing dates |
| 17 | Partial totals render confidently on query failure | plausible | **S4** |
| 18 | Dialog/sheet focus containment + inertness | plausible | **S3/S4** (a11y pass; axe spine exists) |
| 19 | Mocked E2E accepts unknown endpoints; 3/71 component specs; Edge Functions untested | plausible | **S4** — strict-mode mock fallback (fail unknown routes) first |
| 20 | `open-pr.sh` certifies uninspected properties; prod probe treats 401 as success | plausible | **Ops backlog** with #10 |

## Standalone "Now" queue

1. Privacy digest fix (#3) — small edge-function change + redeploy, before
   first invite.

## Notes

- Finding 1 masks finding 8's symptom (dashboard debt progress) for group
  scenarios — retest 8 after the view fix lands.
- S1 spec: `docs/specs/2026-07-13-save-goal-expense-contributions-design.md`
  (rev 3).
