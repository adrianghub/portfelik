# PR8 — UX recovery and honest feedback

**Date:** 2026-07-16  
**Status:** implemented locally

## Problems

1. Settle-undo failures were silent (no toast).
2. Bulk success toasts used `selectedIds.size` instead of manageable/affected counts.
3. Create-then-link failures looked like generic create failures after the tx already existed.
4. Account delete / group disband blocked copy had no actionable next step; ownership transfer RPC had no UI.
5. `/` and `/recurring` used client-only `onMount` redirects (flash / weak recovery).

## Direction

- Settle undo: `.catch(toastError)` on both dashboard and transactions.
- Bulk delete/status/category: return affected counts from services; toast those counts.
- Create+link: stage-tagged error + specific toast when link fails after create.
- Delete-account blocked → link to Groups tab; disband blocked → open members + transfer CTA; wire `transferGroupOwnership`.
- Convert `/` and `/recurring` to `+page.ts` redirects.

## Deferred (YAGNI)

- Operation-ID / tracing infrastructure
- Full “reassign all shared items” wizard
- Broad cron/RLS test expansion beyond what this slice locks in
