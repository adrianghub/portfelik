# Monthly money jobs

This is the product contract for giving current money a purpose each month.
It builds on the trusted private amount defined in
[`monthly-money-availability.md`](./monthly-money-availability.md). Storage and
UI may be implemented only after these transitions can be preserved atomically.

## Mental model

A money job answers: **what is this part of my money for?** Examples include
rent, a weekend, a sofa, holidays, an emergency fund, and a down payment. A job
labels existing money; it does not create cash, income, spending, or net worth.

The first version is private and online-only. Forecast income cannot fund a job.
Group cash, durable offline writes, automatic categorization, and gamification
remain later layers.

## Canonical glossary

| Term         | Canonical meaning                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Transaction  | One ledger row describing real or expected money movement. Only `paid` rows change live cash.                |
| Payment      | A paid expense transaction. It reduces live cash.                                                            |
| Contribution | A paid `Cele` expense linked in full to one saving plan. It moves value from private cash to the goal asset. |
| Link         | An exclusive whole-transaction relation between a transaction and a plan. It does not edit the transaction.  |
| Correction   | An absolute, non-cash saving-goal balance at the end of a Warsaw calendar day.                               |
| Cash         | Reconciled opening cash plus paid ledger movements from the inclusive anchor day.                            |
| Cashflow     | Paid income minus paid expenses in a period. It is not an account balance.                                   |
| Forecast     | A scenario from upcoming, overdue, or projected movements. It is never assignable cash.                      |
| Goal         | A saving destination with a target and deadline; implemented as a `save` plan.                               |
| Plan         | Existing future intent: a saving goal or debt. It settles against full transactions.                         |
| Money job    | A purpose assigned to some eligible live cash. It uses amount-bearing assignment events, not plan links.     |

## State and audit model

Assignment history is append-only. Current job balances are derived from events;
editing or deleting old events is not a normal product action. Every accepted
write receives an idempotency key so retries cannot apply it twice.

At all times, in integer grosze:

```text
assigned_cash = sum(max(0, current_job_balance))
unassigned_cash = eligible_live_cash - assigned_cash
assigned_cash + unassigned_cash = eligible_live_cash
```

Overspending is reported separately. It never creates a negative job balance or
silently removes money from another job.

## Transition table

| Event                       |      Job balance |                        Assigned |                                    Unassigned |                 Ledger cash | Audit rule                                                              |
| --------------------------- | ---------------: | ------------------------------: | --------------------------------------------: | --------------------------: | ----------------------------------------------------------------------- |
| Create job                  |        unchanged |                       unchanged |                                     unchanged |                   unchanged | Append job-created event.                                               |
| Fund job by A               |               +A |                              +A |                                            −A |                   unchanged | Reject when trusted unassigned cash is less than A.                     |
| Move A between jobs         |          −A / +A |                       unchanged |                                     unchanged |                   unchanged | One atomic transfer event; source cannot fall below zero.               |
| Paid expense T, allocated A | −min(A, balance) |        decreases by funded part | rederived; absorbs unallocated/overspent part |              decreases by T | Allocation rows are immutable; their sum cannot exceed T.               |
| Overspend job by O          |     reaches zero | decreases only by prior balance |                                decreases by O |  already changed by payment | Record O as overspent; do not borrow silently.                          |
| Paid income                 |        unchanged |                       unchanged |                  increases with eligible cash |              increases once | Income becomes assignable only after `paid`.                            |
| Reconcile cash anchor       |        unchanged |                       unchanged |                  rederived, possibly negative | replaced from ledger anchor | Append reconciliation; never shrink jobs silently.                      |
| Close month                 |        unchanged |                       unchanged |                                     unchanged |                   unchanged | Freeze the month report; balances carry forward.                        |
| Carry forward               |        unchanged |                       unchanged |                                     unchanged |                   unchanged | Default consequence of close, not a second money movement.              |
| Reopen month                |        unchanged |                       unchanged |                                     unchanged |                   unchanged | Append reopen marker; later corrections remain visible.                 |
| Correct assignment          |      explicit ±A |                   changes by ±A |                             changes inversely |                   unchanged | Append a reasoned correction; positive correction needs available cash. |
| Archive/delete job          |     must be zero |                       unchanged |                                     unchanged |                   unchanged | Move or release remainder first; retain immutable history.              |

When a payment is only partly assigned to jobs, the unassigned remainder reduces
`unassigned_cash`. When a correction or expense makes unassigned cash negative,
the UI shows an overassignment that the user must resolve; it does not rewrite
older choices.

## Month boundary

Month close is reporting, not accounting magic. Unused funded balances carry
forward because the underlying money still exists and still has a purpose. A
month-specific job may be archived only after the user moves or releases its
remainder. Reopening a month never mutates the old snapshot; it appends a marker
and any corrective events.

## Online-only write contract

The first release does not promise offline mutation durability:

1. A write action checks connectivity and never displays success before the
   server confirms it.
2. While pending, the action is visibly pending and cannot be submitted twice.
3. On network or server failure, the entered decision stays available for retry
   and financial state remains unchanged.
4. Retrying uses the same idempotency key.
5. Cached reads may remain available offline, but every assignment control is
   disabled with an explicit `Połącz się z internetem, aby zapisać` explanation.

A durable outbox may replace this policy later, but mixed behavior—some writes
queued and others discarded—is not allowed.

## Gamification boundary

Gamification may celebrate reconciled, user-controlled facts: completing the
monthly assignment, maintaining a buffer, funding a chosen goal, or reviewing an
overspend. It must not reward spending less at any cost, shame a negative month,
or treat forecast income as earned money.
