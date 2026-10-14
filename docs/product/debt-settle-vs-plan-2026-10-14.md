# Debt settle vs plan — control follow-up

**Status:** approved 2026-10-14 (expanded in PR)  
**Branch:** `cursor/debt-plan-settle-split-e8ce`  
**Scope:** Post-#369 control PR.

## Decision

Coherent installment loop on the debt plan:

1. **Zaplanuj raty** — opens the existing transaction form as a monthly recurring create, prefilled from `monthly_payment` / first-payment day / plan category. No plan link.
2. Forecast / Transakcje show projected occurrences.
3. **Dodaj opłaconą ratę** / Powiąż — books or links a **paid** installment (`debt_link_requires_paid`). Date capped at today.
4. Linked paid rows update repayment progress.

## Changes

1. Debt settle CTA copy + dialog title/note; hide status and recurring on settle create-and-link.
2. DayPicker `max=today` for debt settle; reject future paid dates on submit.
3. **Zaplanuj raty** on plan detail and settle (draft create, no `planContext`).
4. Analysis forecast bars/categories/income/expense cards use ledger + projected recurring only so bar drill-down matches `/transactions?status=upcoming,overdue`. Balance line may still include confirmed spend remainders.

## Out of scope

- Full “next installment hero” card on debt detail.
- Auto-link after materializing a recurring occurrence.
