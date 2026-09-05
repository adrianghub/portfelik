# Monthly money availability

This document is the canonical product contract for deciding how much current
money may receive a monthly job. It defines the arithmetic only; assignment
storage, carry-over, splits, and gamification remain separate decisions.

## Scope and trust gate

The first version is private-scope only. Group and mixed-scope availability
must not be inferred from private cash. A confident result requires a cash
anchor dated no more than 31 calendar days ago and not in the future. Missing,
future, or older anchors suppress live, eligible, unassigned, and projected
amounts until the user reconciles the balance.

`opening_amount` is the balance at the **start** of `as_of_date`, before that
day's transactions. Paid transactions dated on or after `as_of_date` are added
or subtracted. UI copy must state this inclusive boundary.

This is a deliberate private-first MVP boundary, not a fallback calculation.
Group plans and transactions may be visible in their own scopes, but they do not
acquire a cash pool from a member's private anchor. Mixed `all` scope therefore
hides cash and future available-to-assign amounts. Shared cash needs a separate
ownership, editing, reconciliation, and no-double-counting design before launch.

## Canonical terms

| Term                 | Meaning                                                                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live cash            | Reconciled opening cash plus paid income minus paid expenses since the inclusive anchor date.                                                                                    |
| Eligible live cash   | `max(0, live cash)`. Every positive live złoty is eligible; a safety reserve must itself be a job, never a hidden deduction.                                                     |
| Assigned cash        | Sum of current live-money balances already given jobs. Assigning labels money; it never creates a ledger transaction or changes net worth.                                       |
| Unassigned cash      | Signed remainder of eligible live cash after assignments. Negative means overassignment.                                                                                         |
| Expected income      | Upcoming income inside the displayed planning horizon. It is context, not assignable cash, until paid.                                                                           |
| Forecast obligations | Upcoming and overdue expenses inside the displayed planning horizon. They are context and should become explicit jobs; subtracting them silently would double-count funded jobs. |

All invariant arithmetic is performed in integer grosze:

```text
eligible_live_cash = max(0, reconciled_live_cash)
unassigned_cash = eligible_live_cash - assigned_cash

assigned_cash + unassigned_cash = eligible_live_cash
```

The separate forecast scenario is:

```text
projected_cash_after_forecast = live_cash + expected_income - forecast_obligations
```

It must never be presented as available to assign.

## State effects

| Event                                   |                            Live cash |              Assigned cash |             Unassigned cash |
| --------------------------------------- | -----------------------------------: | -------------------------: | --------------------------: |
| Upcoming income/expense appears         |                            unchanged |                  unchanged |                   unchanged |
| Transaction becomes paid                |      changes once through the ledger |                  unchanged |                   rederived |
| Money receives, changes, or loses a job |                            unchanged | changes by the same amount |           changes inversely |
| Transaction is corrected/deleted        |          rederived from ledger truth |                  unchanged |                   rederived |
| Anchor is refreshed                     | rederived from the new opening point |                  unchanged |                   rederived |
| Anchor becomes missing/stale/future     |                  hidden as untrusted |                   retained | hidden until reconciliation |

Assignments may eventually exceed eligible cash after a correction or expense.
The engine preserves the signed invariant and exposes the excess explicitly;
it must not silently shrink existing jobs.

## Integration guard

`computePrivateMoneyAvailability` implements this contract now. Product UI must
not display an “unassigned” amount by passing a placeholder `assignedCash = 0`.
It can be wired only after persistent assignment balances and their transition
rules exist.
