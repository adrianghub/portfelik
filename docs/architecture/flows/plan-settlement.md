# Plan Settlement Flow

Plans use first-class `plans` storage. A plan expresses future intent over a
required date period and optional budget. Financial truth remains in
`transactions`; settlement links existing expense and income transactions via
`plan_transaction_links`.

## Target Flow

```mermaid
sequenceDiagram
  participant User
  participant Plan as Plan detail
  participant Tx as Transaction ledger
  participant DB as Supabase

  User->>Plan: Open "Zrealizuj plan"
  Plan->>Tx: Show eligible transactions in plan period
  User->>Plan: Powiąż / Odrzuć suggestions
  Plan->>DB: link_plan_transaction(plan_id, transaction_id)
  DB-->>Plan: Link created
  Plan->>Plan: Recompute Wydano / Wpływy / Pozostało / Bilans
```

## Rules

- A plan can link to many expense and income transactions.
- A transaction can link to one plan in MVP+.
- `link_plan_transaction` enforces auth, private/group scope, supported type,
  and `transactions.date::date` inside `[plans.start_date, plans.end_date]`.
- `remaining = budget_amount - spentAmount`; `balance = incomeAmount - spentAmount`.
- A manual transaction created from a plan is fallback only; after creation it
  should be linked through the same settlement model.
- Deterministic matching produces rank percentage and reasons before the user
  accepts or rejects a suggestion.

## Retired

The first-class Plans cut removes app reliance on `shopping_lists`,
`shopping_list_items`, `transactions.shopping_list_id`, `complete_shopping_list`,
`attach_shopping_list_to_transaction`, and checklist progress.
