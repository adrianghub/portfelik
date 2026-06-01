# Transaction CRUD + summary

The most-trafficked surface in the app. All four operations are direct PostgREST writes (no RPC), and the monthly summary is computed **client-side** from the result set, not via an aggregate RPC.

## Create

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant Form as TransactionDialog
    participant Svc as services/transactions.ts
    participant SB as Supabase auth
    participant PG as PostgREST + RLS
    participant QC as TanStack Query cache

    U->>Form: fill amount, type, category, date<br/>click Save
    Form->>Svc: createTransaction({ amount, type, ... })
    Svc->>SB: auth.getUser()
    SB-->>Svc: user.id
    Svc->>PG: INSERT INTO transactions<br/>{ ...input, user_id, amount=Math.abs(input.amount), status='paid' }
    Note over PG: RLS: WITH CHECK user_id = auth.uid()<br/>passes
    PG-->>Svc: inserted row
    Svc-->>Form: Transaction
    Form->>QC: invalidate ['transactions', start, end, categoryId?]
    Form->>QC: invalidate any summary keys
    Form->>U: close dialog + success toast
```

Two non-obvious bits:

- `user_id` is **passed explicitly** by the service. RLS does not auto-fill `NOT NULL` columns; PostgREST inserts must include them.
- `amount` is normalised to `Math.abs(...)` because the schema CHECK is `amount > 0`. Sign is carried by `type`.

Source: `apps/web-svelte/src/lib/services/transactions.ts:89-109`.

## Update / delete

Same shape, no `user_id` plumbing on update (RLS `using (user_id = auth.uid())` plus the original ownership is enough). `deleteTransactions(ids[])` exists for the bulk-delete UI.

```mermaid
sequenceDiagram
    actor U as User
    participant Svc as services
    participant PG as PostgREST + RLS
    participant QC as Query cache

    U->>Svc: updateTransaction(id, patch)
    Svc->>PG: UPDATE transactions SET ... WHERE id=id
    Note over PG: RLS using (user_id = auth.uid())
    PG-->>Svc: row
    Svc->>QC: invalidate ['transactions', ...]
```

## Read + summary

```mermaid
sequenceDiagram
    autonumber
    participant Page as /transactions
    participant Svc as fetchTransactions
    participant PG as PostgREST view
    participant CS as computeSummary

    Page->>Svc: fetchTransactions(start, end, categoryId?)
    loop while page.length === PAGE_SIZE (1000)
        Svc->>PG: SELECT * FROM transactions_with_category<br/>WHERE date >= start AND date < end<br/>(+ category_id eq) ORDER BY date DESC<br/>RANGE [from, from+999]
        PG-->>Svc: rows
    end
    Svc-->>Page: TransactionWithCategory[]
    Page->>CS: computeSummary(rows)
    CS-->>Page: { total_income, total_expenses, net, categories[] }
```

Why client-side?

- The dataset is **personal-finance-sized**: tens to low-hundreds of rows per month per user. The aggregation happens on data already in memory - the round-trip cost of `get_monthly_summary` would dominate the actual work.
- Filters change interactively (category click-through, range tweaks). Recomputing locally is instantaneous; an RPC would add a network hop per click.
- A SECURITY INVOKER `get_monthly_summary` RPC exists in the schema as an alternative. It is **currently unused** by the SPA but is preserved as a fallback (e.g. for a future server-rendered dashboard or a CSV export endpoint).

Source: `apps/web-svelte/src/lib/services/transactions.ts:11-75`, `supabase/migrations/20260423000000_initial_schema.sql:1279-...` (`get_monthly_summary`).

## Recurring templates

A row with `is_recurring = true` is a **template**, not a real ledger entry. `pg_cron` materialises children once per month:

```mermaid
sequenceDiagram
    participant Cron as pg_cron<br/>0 23 1 * *
    participant SQL as process_recurring_transactions()
    participant T as transactions

    Cron->>SQL: scheduled fire (UTC)
    SQL->>T: SELECT * FROM transactions<br/>WHERE is_recurring = true
    loop per template
        SQL->>T: INSERT INTO transactions<br/>(...template..., recurring_template_id = template.id, date = thisMonthOnRecurringDay)<br/>WHERE NOT EXISTS (child for this month)
    end
```

The dedup predicate uses `recurring_template_id` so a re-run within the same month is a no-op. Status flips by the daily `update_transaction_statuses` job (separate flow).

See `flows/recurring-transactions.md` for the full sequence.

## Error surfaces

- **RLS denial** - PostgREST returns `42501` and the row count zero; surfaces as a generic error toast. (Should rarely happen - UI never shows transactions the user can't write to.)
- **CHECK constraint** - `amount > 0` violation returns a Postgres error; surfaces as a toast.
- **Network failure** - TanStack Query retries up to twice; on terminal failure, mutation `.error` triggers a toast. **No write outbox** - the change is lost. See [audit](../audit-2026-05-09.md) item G1.
