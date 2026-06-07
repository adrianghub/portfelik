# Debt and savings goals (inside Plany)

User-facing **Plany** covers three plan kinds on one spine module—no separate
„Cele” nav item.

## Plan kinds

| Kind | Polish UI section | Purpose |
| ---- | ----------------- | ------- |
| `spend` | Wydatki | Budget/outflow plans (wakacje, remont). Settle with linked expenses. |
| `save` | Cele oszczędnościowe | Accumulation goals (np. Nowy samochód). Progress from linked **income**. |
| `debt` | Kredyty | Loan repayment (hipoteka, auto, consumer). Terms in `plan_debt_terms`. |

Copy is casual PL: **Zrealizuj** (spend), **Powiąż wpłaty** (save), **Powiąż
raty** / **Spłać / nadpłać** (debt).

## Save goals

- `plans.target_amount` is required for `kind=save`.
- `savedAmount` = sum of linked income transactions.
- Detail shows odłożono/target, potrzebujesz vs odkładasz, amber gap banner when
  monthly pace lags.
- Settlement links **wpływy** from transaction history (same `plan_transaction_links`).

## Debt plans

- Manual terms on create: original balance, current balance, annual rate, monthly
  payment.
- Detail: balance hero, stats row (%, rata, ~dzienne odsetki), nadpłata slider,
  timeline bar (było → po nadpłacie), inline terms edit.
- `/plans/[id]/scenarios`: nadpłata vs inwestycja with Belka (19%), break-even gross
  % insight, recommendation badge.
- Semi-auto rata detect ranks recurring expenses ≈ `monthly_payment`; user confirms
  **To moja rata** → `anchor_transaction_id`.
- Optional **Zsynchronizuj saldo** when linked raty sum differs from stored balance.

## Save goals (detail polish)

- Sliders adjust target amount and deadline (updates plan, recalculates tempo).
- **na dobrej drodze** badge on list cards when monthly pace keeps up.

## Manual net worth (D1)

- `financial_snapshots`: one row per user — `cash_amount`, `investments_amount`,
  `real_estate_amount`, `as_of_date` (all manual entry).
- **Majątek netto** on `/plans` = sum(assets) − sum(`plan_debt_terms.current_balance`).
- Copy states values are user-entered; Portfelik does not derive bank balances from import.

## Deferred (D2+)

- Surplus „Masz nadwyżkę …” card (needs surplus definition)
- Safety-cushion copy on scenarios (needs avg expenses baseline)
- Dashboard net-worth strip (duplicate of Plany hero)

## Lifecycle example

1. `save` „Nowy samochód” — odkładasz via linked wpływy.
2. After purchase on credit — new `debt` „Kredyt na auto” under **Kredyty**.
3. Mortgage runs as parallel `debt` „Kredyt hipoteczny”.
