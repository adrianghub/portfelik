# Monthly money jobs — readiness audit

## Decision

**NO-GO.** Do not add monthly-budget tables, assignment UI, gamification, or
carry-over behavior until every P0/P1 item below is closed or explicitly
reclassified with a recorded product decision.

This audit evaluates the existing product as a financial system. It does not
design the new feature. The target flow under review is:

`bank import → transaction → status → cash/forecast → plan progress → export/delete`

## Status vocabulary

- **Confirmed** — implementation and automated evidence agree.
- **Candidate fix** — implemented on `codex/monthly-money-jobs`, but not yet
  validated on staging and therefore not closed.
- **Gap** — current behavior is incomplete, contradictory, or unsafe to build on.
- **Decision** — multiple valid product semantics exist; coding before choosing
  one would silently choose for the user.

## Existing flow inventory

| Area                  | Current source of truth                                       | Status                    | Evidence / remaining concern                                                                                 |
| --------------------- | ------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Bank history          | Committed imported transactions                               | Confirmed                 | Import provenance is private; review and duplicate paths are tested.                                         |
| Categorization        | Transaction category; optional persistent rule                | Confirmed                 | One-off category changes and explicit rule creation/update are separate.                                     |
| Transaction state     | Transaction row, never a notification                         | Confirmed                 | Push settlement retries failure and refreshes transaction/summary/plan queries.                              |
| Periods               | Explicit inclusive UI range, query-safe exclusive upper bound | Confirmed                 | Dashboard defaults to calendar month and deep links preserve range/scope.                                    |
| Ledger vs forecast    | Paid rows vs upcoming/overdue/projections                     | Confirmed                 | Separate partitions and 90-day cash forecast; labels remain distinct.                                        |
| Plan settlement       | `plan_transaction_links`                                      | Confirmed with limitation | Existing transactions are linked; one transaction can settle only one plan.                                  |
| Saving correction     | `plan_progress_snapshots`                                     | Candidate fix             | End-of-day Warsaw semantics and deterministic repeated corrections are implemented and tested.               |
| Live cash             | Private cash anchor plus paid transactions                    | Confirmed with limitation | No complete group/mixed-scope cash model.                                                                    |
| Monthly cashflow      | Paid income minus paid expenses                               | Confirmed and isolated    | Cashflow fields are explicitly named as scenarios, never as money available to assign.                       |
| Account export/delete | Informational JSON and `delete_account()`                     | Candidate fix             | Household-history custody and import cleanup pass a clean local reset/RLS suite; staging validation remains. |
| Adapter trust         | Structural detection plus certification gate                  | Candidate fix             | No bank has real-export certification; confirmation gate requires staging UX validation.                     |

## Blocking register

### P0 — must close before new domain work

#### R-01: available-to-assign contract defined (candidate fix)

The canonical private-scope equation, trust gate, grosz arithmetic, forecast
separation, and state effects are defined in
`docs/product/monthly-money-availability.md` and implemented by
`computePrivateMoneyAvailability`. Unit tests cover missing/stale/future
anchors, cash changes, assignment changes, overassignment, and forecast
separation. It is intentionally not wired to UI before assignment persistence
exists, because a placeholder assigned balance of zero would create a false
“all money is free” result.

Acceptance:

1. [x] One canonical equation distinguishes live cash, assigned cash, unassigned
       cash, expected income, and forecast obligations.
2. [x] Missing or stale cash anchor cannot produce a confident assignable amount.
3. [x] Assignments never change ledger cash or net worth.
4. [x] The invariant `assigned + unassigned = eligible live cash` is tested to the
       grosz for every state transition.

#### R-02: group-owned data lifecycle needs runtime validation

Candidate policy: group-scoped financial rows are household history; private
rows and bank provenance are personal data. On non-owner account deletion,
shared transaction/plan/recurrence custody moves to the current group owner and
departing-user attribution is cleared. The lifecycle matrix is recorded in
`docs/architecture/database.md`. Migration and regression coverage pass a clean
local reset and the full RLS suite on the candidate branch; staging proof still
remains.

Acceptance:

1. Product policy states whether each shared plan, transaction, assignment,
   and contribution is personal data to erase or household history to retain.
2. Leaving a group, removal, ownership transfer, and account deletion have a
   matrix of expected outcomes.
3. RLS tests cover owner, co-owner, member, former member, and deleted member.
4. No remaining row exposes the deleted user's identifier unless legally and
   product-wise intentional.

#### R-03: staging is not current proof

The last `dev` staging deployment failed while resolving `latest` Supabase CLI.
The fixed version is only a candidate branch change.

Acceptance:

1. Candidate commits merge to `dev` through green gates.
2. Staging migration, deploy, persona seed, and real-DB smoke all pass.
3. Manual smoke verifies export, account deletion, and bank confirmation.

#### R-04: bank formats lack real-export certification

Synthetic fixtures validate parser contracts, not current bank exports.

Acceptance:

1. Each auto-proceed adapter satisfies
   `docs/product/bank-import-compatibility.md` certification evidence.
2. Every uncertified adapter requires explicit confirmation.
3. Partial parsing states row counts and skipped/error rows before commit.
4. Real-export regression fixtures contain no customer data.

### P1 — close before implementing assignments

#### R-05: same-day saving anchors use end-of-day replacement (candidate fix)

The product contract now treats a correction dated D as the authoritative balance
at the end of D in `Europe/Warsaw`. Same-day linked contributions are covered by
the correction regardless of action order; only D+1 and later contributions add.
Repeated corrections on D remain auditable and resolve by latest `created_at`, then
UUID as a deterministic tie-breaker.

Acceptance:

- [x] end-of-day replacement semantics documented;
- [x] correction-before-payment and payment-before-correction produce the same total;
- [x] UTC/Warsaw calendar boundaries are covered;
- [x] repeated same-day corrections retain history and resolve deterministically.

#### R-06: private-first cash position is explicit (candidate fix)

The first monthly-money-jobs version is explicitly private-only. A member's cash
anchor is never inferred as group cash; mixed `all` scope hides cash and future
available-to-assign amounts. Existing UI labels the pool `Gotówka (prywatna)` and
automated coverage verifies that group/mixed scope cannot expose it. Shared cash
is deferred until ownership, editing, reconciliation, and no-double-counting are
designed end-to-end.

Acceptance:

- [x] private-first scope is recorded in the canonical availability contract;
- [x] group and mixed scope never infer a pool from private cash;
- [x] the visible amount is explicitly labelled private;
- [x] automated UI coverage verifies the scope boundary.

#### R-07: plan settlement explicitly defers splits (candidate fix)

Current plan settlement remains whole-transaction and exclusive: the database
allows one plan per transaction, the service removes already-linked transactions
from candidates, and the UI warns that the full amount will be assigned to one
plan. Split settlement is intentionally deferred. Future money-job assignments
must use separate amount-bearing records and must not reuse plan links as partial
allocations.

Acceptance:

- [x] whole-transaction, one-plan semantics are documented;
- [x] the schema and suggestion service prevent a second plan link;
- [x] the confirmation surface states that the entire amount is linked;
- [x] partial money-job allocations are separated from settlement links.

#### R-08: carry-over and overspending contract defined (candidate fix)

`docs/product/monthly-money-jobs.md` now defines the append-only state model and
every required transition. Funded balances carry forward because their cash still
exists; close freezes reporting but does not move money; overspending consumes a
job to zero and reduces unassigned cash without silently borrowing from another
job; reopening and corrections append history.

Acceptance:

- [x] create, fund, spend, move, overspend, close, carry, reopen, correct, and
      archive/delete are defined;
- [x] every transition states its cash, assigned, and unassigned effect;
- [x] balances use grosze and preserve the assignable-money invariant;
- [x] audit history is append-only and non-zero jobs cannot be deleted.

#### R-09: assignment writes are explicitly online-only (product decision)

The first assignment release is online-only. Cached reads may work offline, but
assignment controls must be disabled with explicit copy. Success appears only
after server confirmation; pending actions cannot double-submit; failed input is
kept for retry with the same idempotency key. A durable outbox remains deferred.

Acceptance:

- [x] online-only scope and offline copy are defined;
- [x] pending, failure, retry, and idempotency behavior are defined;
- [x] false success and mixed queued/discarded behavior are forbidden.

#### R-10: canonical vocabulary and settlement flow aligned (candidate fix)

The monthly-money-jobs glossary defines transaction, payment, contribution, link,
correction, cash, cashflow, forecast, goal, plan, and money job. Canonical product
and architecture documents now agree that saving progress uses paid `Cele`
expenses plus non-cash corrections. The superseded income-based design is marked
historical rather than presented as current behavior.

Acceptance:

- [x] one canonical glossary defines every required term;
- [x] product direction, plan flow, and overview use paid-expense semantics;
- [x] the contradictory income-based design is explicitly superseded.

#### R-11: export table inventory is executable (candidate fix)

Every app-owned public table is now classified as exported, intentionally
omitted with a reason, or ephemeral. Plan links and recurring occurrence skips
are exported explicitly. Private cash is exported; unsupported group cash remains
an explicit omission inside that table's contract. The export remains labelled
informational rather than restorable or full.

Acceptance:

- [x] every current public application table has a disposition and rationale;
- [x] durable plan links and recurrence-skip decisions are present in the bundle;
- [x] raw bank data, secrets, preferences, and ephemeral delivery state are explicit;
- [x] a regression test derives the final schema from migrations and fails on an
      unclassified future table.

### P2 — hardening before broader launch

- Resolve or baseline Supabase advisor warnings; security warnings must have an
  owner and rationale, performance warnings a measurable threshold.
- Define durable freshness rules for stale imports and stale cash anchors.
- Test concurrent edits and double-click/idempotency for every money mutation.
- Verify every mutation's query invalidation and reload behavior from a single
  matrix rather than isolated bug fixes.
- Create GitHub issues for every unfinished item; the repository currently has
  no open issue backlog for these known gaps.

## Required scenario suite

The go/no-go review must run these scenarios end to end:

1. Import paid income and expense; reconcile live cash and dashboard totals.
2. Import the same file twice; commit only legitimate new rows.
3. Change one category without changing a rule; explicitly create and replace a rule.
4. Settle upcoming/overdue from list and push; verify failure, retry, stale action, and reload.
5. Link, unlink, add, and correct a saving goal across a month and day boundary.
6. Perform the same actions in private, group-owner, co-owner, member, and former-member scopes.
7. Leave/remove/delete an account after creating shared and private financial rows.
8. Export before deletion and reconcile every exported financial object.
9. Lose network during each write; verify no false success or duplicate retry.
10. Cross month-end in Europe/Warsaw, including DST, with paid and forecast rows.

## Go/no-go gate

Proceed only when:

- every P0/P1 entry has linked evidence and a passing acceptance test;
- staging matches the reviewed commit and passes real-DB smoke;
- schema, services, UI copy, and product documentation use the same semantics;
- no calculation labels cashflow or forecast as spendable cash;
- the private/group boundary is visible on every amount and mutation;
- an independent regression review finds no unclassified financial state.

Until then the branch may contain fixes, but the monthly-money-jobs feature
remains frozen.
