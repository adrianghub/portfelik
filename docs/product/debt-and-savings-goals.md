# Debt and savings goals (inside Plany)

User-facing **Plany** covers goals and loans on one spine module-no separate
„Cele” nav item and no redundant expense-plan type.

## Plan kinds

| Kind   | Polish UI section    | Purpose                                                                                                                   |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `save` | Cele oszczędnościowe | Accumulation goals (np. Nowy samochód). Progress from linked paid goal-allocation **expenses** plus non-cash corrections. |
| `debt` | Kredyty              | Loan repayment (hipoteka, auto, consumer). Terms in `plan_debt_terms`.                                                    |

Copy is casual PL: **Powiąż wpłaty** (save), **Powiąż raty** / **Spłać /
nadpłać** (debt).

## Save goals

- `plans.target_amount` is required for `kind=save`.
- `savedAmount` = latest absolute balance from `plan_progress_snapshots` plus paid
  linked expense transactions dated after that snapshot. Without a snapshot, all
  paid linked expenses count. This prevents a later import of older history from
  double-counting money already covered by a correction.
- A correction dated D is the authoritative balance **at the end of D** in the
  `Europe/Warsaw` product calendar. A linked payment from D is already covered by
  that balance regardless of whether it was recorded before or after the correction;
  only payments from D+1 and later add to it.
- Corrections remain an audit trail. If several corrections have the same effective
  date, the last-created row wins; UUID is the deterministic tie-breaker if their
  creation timestamps are equal.
- **Zapisz nową wpłatę** creates and links a paid `Cele` expense because it
  represents a real cash movement. The dialog warns not to use it when the same
  movement already exists or will arrive through bank import.
- **Powiąż istniejącą transakcję** reuses a paid expense already present in the ledger.
- **Skoryguj stan celu** appends a non-cash adjustment. It changes total progress only;
  it never changes cash, spending, or current-month contribution pace.
- Detail shows odłożono/target, potrzebujesz vs odkładasz, amber gap banner when
  monthly pace lags.
- Settlement links paid goal-allocation **expenses** from transaction history (same
  `plan_transaction_links`).
- Settlement is whole-transaction and exclusive: one transaction may be linked to
  one plan, and its full amount counts. Split settlement is intentionally deferred;
  the settle UI states this before the user confirms a link. Money-job assignments
  must use their own amount-bearing records rather than overloading plan links.

## Debt plans

- Manual terms on create: original balance, current balance, annual rate, monthly
  payment.
- Detail: balance hero, stats row (%, rata, ~dzienne odsetki), nadpłata tabs
  (**Miesięcznie** | **Jednorazowo**), timeline bar (było → po nadpłacie), inline terms edit.
- Jednorazowa nadpłata: symulacja wpływu na dzienne odsetki, łączną oszczędność i skrócenie
  spłaty (nie zapisuje kwoty w planie).
- `/plans/[id]/scenarios`: nadpłata vs inwestycja - werdykt + porównanie stóp zwrotu (Belka 19%),
  potem kwoty z jasnym footnote; inwestycja liczona na horyzoncie bazowego kredytu.
- Semi-auto rata detect ranks recurring expenses ≈ `monthly_payment`; user confirms
  **To moja rata** → `anchor_transaction_id`.
- Saldo z transakcji: auto-aktualizacja po powiązaniu raty na `/settle`; ręczne **Zastosuj**
  tylko gdy są powiązania i zapisane saldo odbiega od wyliczenia.

## Save goals (detail polish)

- Sliders adjust target amount and deadline (updates plan, recalculates tempo).
- **ten miesiąc: gotowe** badge on list cards only when real contributions linked in
  the current calendar month meet the required monthly amount. Historical averages
  never satisfy or label the current month.

## Manual net worth and monthly surplus

Removed from Kokpit and Plany. Category spending limits replaced that view.
Tables `financial_snapshots`, `net_worth_items`, and `cash_positions` stay so
existing rows and account export are unchanged. A later migration may drop the
unused snapshot tables. See [One step back](./one-step-back.md).

## Group collaboration (G1 + G2)

- **G1 read + settle:** any group member sees shared plans and may link/unlink eligible
  group-scoped transactions via `link_plan_transaction` (scope must match).
- **G2 writes:** only plan creator or group owner/co-owner may edit/delete plans and debt
  terms (`is_group_co_owner` RLS). Plain members get read-only detail and settle actions.

## Deferred (D3+)

- Safety-cushion copy on scenarios (needs an average-expenses baseline)

## Lifecycle example

1. `save` „Nowy samochód” - odkładasz przez powiązane, opłacone wydatki `Cele`.
2. After purchase on credit - new `debt` „Kredyt na auto” under **Kredyty**.
3. Mortgage runs as parallel `debt` „Kredyt hipoteczny”.
