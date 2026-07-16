# PR6 — Import / export integrity

**Date:** 2026-07-16  
**Status:** implemented locally

## Problems

1. `patchRow` swallowed server errors → bulk/undo treated failures as success.
2. Discard/cancel/new-session paths cleared local draft even when cancel failed (stale `preview` sessions).
3. Cancel was a bare table UPDATE with no ownership/idempotency contract.
4. Account export used nonexistent `row_count`, omitted cash/net-worth items, and understated its informational contract.

## Direction

- `patchRow` rethrows after rollback+toast; undo restores the stack entry on failure.
- Discard/cancel/prior-session cancel: keep draft + toast on failure; clear only after server success.
- `cancel_import_session` SECURITY INVOKER RPC: preview→cancelled; already cancelled = success; committed = error.
- Export: `rows_total`, include `cash_positions` + `net_worth_items`, document informational contract in copy (`export_contract: "informational_v1"`).

## Out of scope / YAGNI

- Round-trip export→import restore
- Exporting notifications, push subs, invites, raw import rows, dismissals
- Auto-cancel on intentional “save draft” leave
