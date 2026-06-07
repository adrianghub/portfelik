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
- Detail: balance hero, stats row (%, rata, ~dzienne odsetki), nadpłata slider.
- `/plans/[id]/scenarios`: nadpłata vs inwestycja (nominal compare, no Belka v1).
- Semi-auto rata detect ranks recurring expenses ≈ `monthly_payment`; user confirms
  **To moja rata** → `anchor_transaction_id`.

## Deferred (not v1)

- Net-worth hub / `financial_snapshots`
- Belka tax in invest comparison
- Real-estate asset line
- Surplus „Masz nadwyżkę …” card

## Lifecycle example

1. `save` „Nowy samochód” — odkładasz via linked wpływy.
2. After purchase on credit — new `debt` „Kredyt na auto” under **Kredyty**.
3. Mortgage runs as parallel `debt` „Kredyt hipoteczny”.
