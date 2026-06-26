# Recurring/Upcoming Series Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calendar-style recurrence management (act on any occurrence with scope: this one / this and following) via a new `recurrence_end_date`, plus a forecast running balance that shows expected balance after upcoming transactions.

**Architecture:** Add a nullable `recurrence_end_date` to `transactions` (template-only state). Pure projection (`recurring-forecast.ts`) and materialization respect it. A new `services/recurring-series.ts` holds the scoped write operations + pure date helpers. `TransactionDetailSheet` gains a "Seria cykliczna" panel with scope choosers; series freq/interval/day editing reuses the existing `TransactionDialog` loaded with the template. A new pure `forecastRunningBalances` in `cash-position.ts` continues the live balance through upcoming + projected rows; the `Saldo` column and a "Przewidywane saldo" figure consume it. Private scope only.

**Tech Stack:** SvelteKit (adapter-static, Svelte 5 runes), Supabase (PostgREST + RLS), TanStack Query v6, Paraglide v2 i18n, Vitest (unit + RLS), Playwright (E2E).

## Global Constraints

- svelte-check must report 0 errors, 0 warnings (`pnpm exec svelte-check --tsconfig ./tsconfig.json`).
- `pnpm lint` 0 errors; `pnpm format:check` clean (run `pnpm format` to fix).
- Recompile Paraglide after ANY `messages/pl.json` edit: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`. `src/lib/paraglide/**` is gitignored.
- All UTC date math; `transactions.date` is `timestamptz`, compared date-only (`YYYY-MM-DD`).
- PostgREST inserts must pass `user_id` explicitly (RLS does not auto-set).
- `createMutation` is NOT a store — use `mutation.mutate(...)`, `mutation.isPending`.
- Migrations: never amend an applied migration; idempotent naming `YYYYMMDDHHMMSS_*.sql`. The next free timestamp after `20260721000000` is **`20260722000000`**.
- Run Svelte MCP autofixer (`mcp__svelte__svelte-autofixer`) on every edited `.svelte` component.
- Forecast running balance is PRIVATE scope only (`group_id === null`, `showCashView`). Group scope is out of scope (Spec 3).
- All paths below are relative to `apps/web-svelte/` unless prefixed with `supabase/`.

---

### Task 1: Migration — `recurrence_end_date` column + view refresh

**Files:**
- Create: `supabase/migrations/20260722000000_recurrence_end_date.sql`

**Interfaces:**
- Produces: `transactions.recurrence_end_date date NULL`; surfaced through the `transactions_with_category` view.

The view is defined with `select t.*`, which Postgres expands at creation time — a new base-table column does NOT appear until the view is recreated. So the migration adds the column AND re-runs the view definition (verbatim from `20260717000000_transactions_is_hold_view.sql`).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260722000000_recurrence_end_date.sql`:

```sql
-- Calendar-style recurrence end: optional stop date for a recurring template.
-- NULL = open-ended (prior behavior). Meaningful only on template rows
-- (is_recurring = true); ignored on occurrence rows.
alter table public.transactions
  add column if not exists recurrence_end_date date;

comment on column public.transactions.recurrence_end_date is
  'Optional inclusive last date a recurring template generates occurrences. NULL = open-ended. Template-only.';

-- Recreate the view so select t.* picks up the new column.
create or replace view public.transactions_with_category
  with (security_invoker = true)
as
  select
    t.*,
    c.name as category_name,
    c.type as category_type,
    coalesce(l.is_hold, false) as is_hold
  from public.transactions t
  join public.categories c on c.id = t.category_id
  left join public.transaction_import_links l on l.transaction_id = t.id;

comment on view public.transactions_with_category is
  'Transactions joined with category name/type and hold flag. SECURITY INVOKER - caller RLS applies.';

grant select on table public.transactions_with_category to authenticated, anon, service_role;
```

- [ ] **Step 2: Apply + verify the column and view surface it**

Run (from repo root):
```bash
supabase db reset
```
Expected: all migrations replay through `20260722000000` with no error.

Then verify:
```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c \
  "select column_name from information_schema.columns where table_name='transactions_with_category' and column_name='recurrence_end_date';"
```
Expected: one row, `recurrence_end_date`.

- [ ] **Step 3: Regenerate Supabase types**

Run (from `apps/web-svelte/`):
```bash
pnpm exec supabase gen types typescript --local > src/lib/supabase.types.ts
```
Expected: `recurrence_end_date` appears in the `transactions` Row/Insert/Update and in `transactions_with_category` Row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260722000000_recurrence_end_date.sql apps/web-svelte/src/lib/supabase.types.ts
git commit -m "feat(db): add recurrence_end_date to transactions + refresh view"
```

---

### Task 2: Type + service plumbing for `recurrence_end_date`

**Files:**
- Modify: `src/lib/types.ts` (Transaction interface)
- Modify: `src/lib/services/transactions.ts` (`CreateTransactionInput`)

**Interfaces:**
- Produces: `Transaction.recurrence_end_date: string | null`; `CreateTransactionInput.recurrence_end_date?: string | null`.
- Consumes: nothing.

`fetchTransactions` selects `*`, so reads carry the field automatically once the view is refreshed (Task 1). `createTransaction`/`updateTransaction` spread `input`, so passing `recurrence_end_date` through `CreateTransactionInput` is enough.

- [ ] **Step 1: Add the field to the `Transaction` interface**

In `src/lib/types.ts`, in `export interface Transaction`, add after `recurring_occurrence_date: string | null;`:

```ts
  recurrence_end_date: string | null;
```

- [ ] **Step 2: Add the field to `CreateTransactionInput`**

In `src/lib/services/transactions.ts`, in `export interface CreateTransactionInput`, add after `recurrence_month?: number | null;`:

```ts
  recurrence_end_date?: string | null;
```

- [ ] **Step 3: Verify it type-checks**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/services/transactions.ts
git commit -m "feat(transactions): carry recurrence_end_date through types + create input"
```

---

### Task 3: Projection respects `recurrence_end_date`

**Files:**
- Modify: `src/lib/services/recurring-forecast.ts`
- Test: `tests/unit/recurring-forecast.spec.ts`

**Interfaces:**
- Consumes: `Transaction.recurrence_end_date` (Task 2).
- Produces: `occurrenceDates` / `projectRecurringOccurrences` no longer emit occurrences dated after a template's `recurrence_end_date`.

Materialization (`materializeRecurringOccurrencesForNearTerm`) calls `projectRecurringOccurrences`, so it inherits this behavior automatically.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/recurring-forecast.spec.ts` (the `template()` factory there already returns a monthly `recurring_day: 10` template; it does NOT yet set `recurrence_end_date`, which defaults to `undefined` — treat absent as open-ended):

```ts
describe("projectRecurringOccurrences — recurrence_end_date", () => {
  it("stops emitting occurrences after the end date", () => {
    const t = template({ recurrence_end_date: "2026-07-31" });
    const out = projectRecurringOccurrences([t], "2026-06-23", "2026-09-23");
    // monthly on the 10th: Jul 10 kept, Aug 10 / Sep 10 dropped (after end).
    expect(out.map((o) => o.date)).toEqual(["2026-07-10"]);
  });

  it("treats a null/absent end date as open-ended", () => {
    const t = template({ recurrence_end_date: null });
    const out = projectRecurringOccurrences([t], "2026-06-23", "2026-09-23");
    expect(out.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --config vitest.unit.config.ts tests/unit/recurring-forecast.spec.ts`
Expected: FAIL — the end-date case emits Aug/Sep occurrences.

- [ ] **Step 3: Implement the end-date bound**

In `src/lib/services/recurring-forecast.ts`, inside `projectRecurringOccurrences`, the per-template loop is:

```ts
  for (const t of templates) {
    const freq = t.recurrence_frequency;
    if (freq) continue;       // (existing guard — keep as-is)
```

Replace the loop body's occurrence emission. The current loop is:

```ts
  for (const t of templates) {
    const freq = t.recurrence_frequency;
    if (!freq) continue;
    const templateDate = t.date.slice(0, 10);
    for (const d of occurrenceDates(t, afterMs, beforeMs)) {
      const date = isoDate(d);
      if (date === templateDate) continue;
      if (taken.has(`${t.id}|${recurringPeriodKey(freq, d)}`)) continue;
```

Change it to compute an end bound and skip dates past it:

```ts
  for (const t of templates) {
    const freq = t.recurrence_frequency;
    if (!freq) continue;
    const templateDate = t.date.slice(0, 10);
    // Inclusive last day the template may generate; null = open-ended.
    const endMs = t.recurrence_end_date
      ? new Date(t.recurrence_end_date).getTime()
      : Number.POSITIVE_INFINITY;
    for (const d of occurrenceDates(t, afterMs, beforeMs)) {
      const date = isoDate(d);
      if (date === templateDate) continue;
      if (d.getTime() > endMs) continue;
      if (taken.has(`${t.id}|${recurringPeriodKey(freq, d)}`)) continue;
```

(`new Date("YYYY-MM-DD")` parses as UTC midnight, matching the UTC `d` cursor. The rest of the loop body is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --config vitest.unit.config.ts tests/unit/recurring-forecast.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Run the full unit suite (no regressions)**

Run: `pnpm test:unit`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/recurring-forecast.ts tests/unit/recurring-forecast.spec.ts
git commit -m "feat(forecast): stop recurring projections after recurrence_end_date"
```

---

### Task 4: `recurring-series.ts` — scoped series operations + pure helpers

**Files:**
- Create: `src/lib/services/recurring-series.ts`
- Test: `tests/unit/recurring-series.spec.ts`

**Interfaces:**
- Consumes: `supabase`, `TransactionWithCategory`, `rememberRecurringOccurrenceSkip` (from `recurring-occurrences.ts`), `deleteTransaction` (from `transactions.ts`).
- Produces:
  - `dayBefore(iso: string): string` — date-only `YYYY-MM-DD`, one UTC day earlier.
  - `isFutureUpcomingOccurrence(tx, templateId, fromDate): boolean` — pure predicate for "future materialized occurrence of this template on/after `fromDate`".
  - `endSeriesFromOccurrence(opts: { template: TransactionWithCategory; occurrenceDate: string }): Promise<void>`
  - `skipOccurrence(occurrence: TransactionWithCategory): Promise<void>`
  - `materializeOccurrence(opts: { template: TransactionWithCategory; occurrenceDate: string }): Promise<TransactionWithCategory>`

- [ ] **Step 1: Write failing tests for the pure helpers**

Create `tests/unit/recurring-series.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { TransactionWithCategory } from "$lib/types";
import { dayBefore, isFutureUpcomingOccurrence } from "$lib/services/recurring-series";

function occ(over: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return {
    id: "o1",
    amount: 100,
    currency: "PLN",
    counterparty: null,
    description: "Terapia",
    date: "2026-07-15",
    type: "expense",
    status: "upcoming",
    category_id: "c1",
    user_id: "u1",
    is_recurring: false,
    recurring_day: null,
    recurrence_frequency: null,
    recurrence_interval: 1,
    recurrence_weekday: null,
    recurrence_month: null,
    recurring_template_id: "tmpl-1",
    recurring_occurrence_date: "2026-07-15",
    recurrence_end_date: null,
    group_id: null,
    created_at: "",
    updated_at: "",
    category_name: "Zdrowie",
    category_type: "expense",
    is_hold: false,
    ...over,
  };
}

describe("dayBefore", () => {
  it("returns the previous UTC day", () => {
    expect(dayBefore("2026-07-15")).toBe("2026-07-14");
  });
  it("crosses month boundaries", () => {
    expect(dayBefore("2026-08-01")).toBe("2026-07-31");
  });
  it("crosses year boundaries", () => {
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
  });
});

describe("isFutureUpcomingOccurrence", () => {
  it("matches an upcoming occurrence of the template on/after the cutoff", () => {
    expect(isFutureUpcomingOccurrence(occ({ date: "2026-07-15" }), "tmpl-1", "2026-07-15")).toBe(
      true
    );
  });
  it("excludes occurrences before the cutoff", () => {
    expect(isFutureUpcomingOccurrence(occ({ date: "2026-07-08" }), "tmpl-1", "2026-07-15")).toBe(
      false
    );
  });
  it("excludes paid rows (only upcoming get pruned)", () => {
    expect(
      isFutureUpcomingOccurrence(occ({ date: "2026-07-22", status: "paid" }), "tmpl-1", "2026-07-15")
    ).toBe(false);
  });
  it("excludes rows from a different template", () => {
    expect(
      isFutureUpcomingOccurrence(occ({ recurring_template_id: "other" }), "tmpl-1", "2026-07-15")
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --config vitest.unit.config.ts tests/unit/recurring-series.spec.ts`
Expected: FAIL — module `recurring-series` not found.

- [ ] **Step 3: Implement the service**

Create `src/lib/services/recurring-series.ts`:

```ts
import { supabase } from "$lib/supabase";
import type { TransactionWithCategory } from "$lib/types";
import { rememberRecurringOccurrenceSkip } from "$lib/services/recurring-occurrences";
import { deleteTransaction } from "$lib/services/transactions";

/** Date-only YYYY-MM-DD, one UTC day before the given ISO date. */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Pure: is `tx` an upcoming materialized occurrence of `templateId` dated on/after `fromDate`? */
export function isFutureUpcomingOccurrence(
  tx: Pick<TransactionWithCategory, "recurring_template_id" | "status" | "date">,
  templateId: string,
  fromDate: string
): boolean {
  return (
    tx.recurring_template_id === templateId &&
    tx.status === "upcoming" &&
    tx.date.slice(0, 10) >= fromDate.slice(0, 10)
  );
}

/**
 * End a series at `occurrenceDate` ("this and following"): set the template's
 * recurrence_end_date to the day before, then delete future upcoming
 * materialized rows dated on/after the occurrence. Past real rows are kept.
 */
export async function endSeriesFromOccurrence(opts: {
  template: TransactionWithCategory;
  occurrenceDate: string;
}): Promise<void> {
  const { template, occurrenceDate } = opts;
  const { error: updErr } = await supabase
    .from("transactions")
    .update({ recurrence_end_date: dayBefore(occurrenceDate) })
    .eq("id", template.id);
  if (updErr) throw updErr;

  const { error: delErr } = await supabase
    .from("transactions")
    .delete()
    .eq("recurring_template_id", template.id)
    .eq("status", "upcoming")
    .gte("date", occurrenceDate.slice(0, 10));
  if (delErr) throw delErr;
}

/** Skip a single occurrence ("this occurrence"): record a skip + delete the real row if materialized. */
export async function skipOccurrence(occurrence: TransactionWithCategory): Promise<void> {
  if (occurrence.recurring_template_id && occurrence.recurring_occurrence_date) {
    await rememberRecurringOccurrenceSkip(occurrence);
  }
  // Projected rows have synthetic ids ("projected:..."); only delete real rows.
  if (!occurrence.projected && occurrence.recurring_template_id) {
    await deleteTransaction(occurrence.id);
  }
}

/**
 * Insert one real row for a projected occurrence so it can be edited as a single
 * instance ("edit this occurrence" on a projected row). Returns the created row
 * joined with its category. Upsert conflict key matches near-term materialization.
 */
export async function materializeOccurrence(opts: {
  template: TransactionWithCategory;
  occurrenceDate: string;
}): Promise<TransactionWithCategory> {
  const { template, occurrenceDate } = opts;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data, error } = await supabase
    .from("transactions")
    .upsert(
      {
        amount: Math.abs(Number(template.amount)),
        currency: template.currency,
        counterparty: template.counterparty,
        description: template.description,
        date: occurrenceDate.slice(0, 10),
        type: template.type,
        status: "upcoming" as const,
        category_id: template.category_id,
        user_id: template.user_id,
        group_id: template.group_id,
        is_recurring: false,
        recurring_day: null,
        recurrence_frequency: null,
        recurrence_interval: 1,
        recurrence_weekday: null,
        recurrence_month: null,
        recurring_template_id: template.id,
        recurring_occurrence_date: occurrenceDate.slice(0, 10),
      },
      { onConflict: "user_id,recurring_template_id,recurring_occurrence_date" }
    )
    .select("id")
    .single();
  if (error) throw error;

  // Re-fetch through the category view so the caller gets a full TransactionWithCategory.
  const { data: row, error: fetchErr } = await supabase
    .from("transactions_with_category")
    .select("*")
    .eq("id", (data as { id: string }).id)
    .single();
  if (fetchErr) throw fetchErr;
  return row as TransactionWithCategory;
}
```

- [ ] **Step 4: Run to verify the pure-helper tests pass**

Run: `pnpm exec vitest run --config vitest.unit.config.ts tests/unit/recurring-series.spec.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json`
Expected: 0/0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/recurring-series.ts tests/unit/recurring-series.spec.ts
git commit -m "feat(recurring): scoped series ops (end-from-occurrence, skip, materialize)"
```

---

### Task 5: `forecastRunningBalances` in cash-position

**Files:**
- Modify: `src/lib/services/cash-position.ts`
- Test: `tests/unit/cash-position.spec.ts` (create if absent)

**Interfaces:**
- Consumes: existing `Anchor`, `signed`, `dateOnly`, `openingOf`, `asOfOf`, `RunningBalanceTx`.
- Produces: `forecastRunningBalances(anchor: Anchor, txs: RunningBalanceTx[]): Map<string, number>` — per-row balance over paid + upcoming rows on/after the anchor, in date order, keyed by id. Paid and upcoming both accumulate; rows before the anchor or with other statuses are omitted.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/cash-position.spec.ts` (or append if it exists):

```ts
import { describe, expect, it } from "vitest";
import { forecastRunningBalances, type RunningBalanceTx } from "$lib/services/cash-position";

const anchor = { opening_amount: 1000, as_of_date: "2026-06-01" };

function tx(over: Partial<RunningBalanceTx> & { id: string }): RunningBalanceTx {
  return { type: "expense", amount: 0, status: "upcoming", date: "2026-07-01", ...over };
}

describe("forecastRunningBalances", () => {
  it("accumulates paid then upcoming in date order from the opening balance", () => {
    const rows: RunningBalanceTx[] = [
      tx({ id: "paid1", status: "paid", type: "income", amount: 200, date: "2026-06-10" }),
      tx({ id: "up1", status: "upcoming", type: "expense", amount: 50, date: "2026-07-05" }),
      tx({ id: "up2", status: "upcoming", type: "expense", amount: 100, date: "2026-07-10" }),
    ];
    const m = forecastRunningBalances(anchor, rows);
    expect(m.get("paid1")).toBe(1200); // 1000 + 200
    expect(m.get("up1")).toBe(1150); // 1200 - 50
    expect(m.get("up2")).toBe(1050); // 1150 - 100
  });

  it("omits rows before the anchor and non-paid/non-upcoming statuses", () => {
    const rows: RunningBalanceTx[] = [
      tx({ id: "old", status: "paid", type: "expense", amount: 500, date: "2026-05-01" }),
      tx({ id: "draft", status: "draft", type: "expense", amount: 10, date: "2026-07-01" }),
      tx({ id: "up", status: "upcoming", type: "expense", amount: 100, date: "2026-07-02" }),
    ];
    const m = forecastRunningBalances(anchor, rows);
    expect(m.has("old")).toBe(false);
    expect(m.has("draft")).toBe(false);
    expect(m.get("up")).toBe(900); // 1000 - 100
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --config vitest.unit.config.ts tests/unit/cash-position.spec.ts`
Expected: FAIL — `forecastRunningBalances` not exported.

- [ ] **Step 3: Implement it**

In `src/lib/services/cash-position.ts`, add after the existing `runningBalances` function:

```ts
/**
 * Forecast balance-after-each-row: continues the live balance through both paid
 * and upcoming rows on/after the anchor's as_of_date, in chronological order.
 * Keyed by tx id. Rows before the anchor or with other statuses (draft/overdue)
 * are omitted. Pure — caller supplies the private paid + upcoming + projected set.
 */
export function forecastRunningBalances(
  anchor: Anchor,
  txs: RunningBalanceTx[]
): Map<string, number> {
  const asOf = asOfOf(anchor);
  const rows = txs
    .filter(
      (t) => (t.status === "paid" || t.status === "upcoming") && dateOnly(t.date) >= asOf
    )
    .sort((a, b) => dateOnly(a.date).localeCompare(dateOnly(b.date)));
  const result = new Map<string, number>();
  let balance = openingOf(anchor);
  for (const t of rows) {
    balance += signed(t);
    result.set(t.id, balance);
  }
  return result;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run --config vitest.unit.config.ts tests/unit/cash-position.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/cash-position.ts tests/unit/cash-position.spec.ts
git commit -m "feat(cash): forecast running balance through upcoming rows"
```

---

### Task 6: TransactionDialog — end-date field in the recurrence panel

**Files:**
- Modify: `src/lib/components/transactions/TransactionDialog.svelte`
- Modify: `messages/pl.json`

**Interfaces:**
- Consumes: `CreateTransactionInput.recurrence_end_date` (Task 2).
- Produces: when editing/creating a template (`saveAsRecurring === true`), the form submits `recurrence_end_date` (string `YYYY-MM-DD` or `null`).

This is the "Cała seria" edit surface (also how the user extends/shortens via a date). Only shown when the recurrence panel is shown (`is_recurring && !isRecurringOccurrenceEdit`).

- [ ] **Step 1: Add the message string**

In `messages/pl.json`, add near the other `transaction_form_recurrence_*` keys:

```json
  "transaction_form_recurrence_end": "Data zakończenia (opcjonalnie)",
```

- [ ] **Step 2: Recompile Paraglide**

Run: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`
Expected: "Successfully compiled".

- [ ] **Step 3: Add the state field**

In `TransactionDialog.svelte`, find the recurrence state declarations (near `recurrence_frequency`, `recurring_day`, etc. around lines 54-80). Add a state variable alongside them:

```ts
  let recurrenceEndDate = $state<string>("");
```

Initialize it where the other recurrence fields read from `initial` (the on-mount/`$effect` reset block that sets `recurrence_frequency` etc.). Add:

```ts
  recurrenceEndDate = initial?.recurrence_end_date ?? "";
```

- [ ] **Step 4: Add the input to the recurrence panel**

In the recurrence config block (the `{#if is_recurring && !isRecurringOccurrenceEdit}` panel, around lines 259-323, after the `recurring_day`/`recurrence_month` inputs), add:

```svelte
        <label class="block">
          <span class="text-eyebrow mb-1 block text-slate-400"
            >{m.transaction_form_recurrence_end()}</span
          >
          <input
            type="date"
            bind:value={recurrenceEndDate}
            class="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
          />
        </label>
```

- [ ] **Step 5: Submit the field**

In the save handler, where the payload is built with `recurrence_frequency` etc. (gated by `saveAsRecurring`), add to the recurring branch:

```ts
        recurrence_end_date: recurrenceEndDate || null,
```

And in the non-recurring / occurrence branch, ensure it's sent as `null` (so toggling off clears it):

```ts
        recurrence_end_date: null,
```

- [ ] **Step 6: Svelte autofixer + checks**

Run the `mcp__svelte__svelte-autofixer` tool on the edited `TransactionDialog.svelte` (paste its full contents). Fix any reported issues.
Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json`
Expected: 0/0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/transactions/TransactionDialog.svelte messages/pl.json
git commit -m "feat(transactions): edit recurrence end date from the template form"
```

---

### Task 7: TransactionDetailSheet — "Seria cykliczna" panel with scope choosers

**Files:**
- Modify: `src/lib/components/transactions/TransactionDetailSheet.svelte`
- Modify: `messages/pl.json`

**Interfaces:**
- Consumes: `transaction` (may be projected / occurrence / template).
- Produces: three new optional callback props the page wires in Task 8:
  - `oneditseries?: (tx: TransactionWithCategory) => void` — edit the whole series (page fetches the template + opens dialog).
  - `oneditoccurrence?: (tx: TransactionWithCategory) => void` — edit this one (page materializes if projected, then opens dialog).
  - `onskipoccurrence?: (tx: TransactionWithCategory) => void` — skip this one.
  - `onendseries?: (tx: TransactionWithCategory) => void` — end this and following.
- The existing `onedit`/`ondelete` remain for non-series single rows.

The panel shows for any row that is part of a series: `transaction.is_recurring` (template) OR `transaction.recurring_template_id` (occurrence) OR `transaction.projected`. Scope choice is a small inline two-button group revealed per action (no new dialog component).

- [ ] **Step 1: Add message strings**

In `messages/pl.json`:

```json
  "transactions_series_title": "Seria cykliczna",
  "transactions_series_edit": "Edytuj",
  "transactions_series_delete": "Usuń",
  "transactions_series_scope_this": "To wystąpienie",
  "transactions_series_scope_following": "To i przyszłe",
  "transactions_series_scope_all": "Cała seria",
```

Recompile Paraglide:
Run: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`

- [ ] **Step 2: Add props + a derived "is part of a series" flag + local scope state**

In `TransactionDetailSheet.svelte` `<script>`, extend `Props` and destructuring:

```ts
    oneditseries?: (tx: TransactionWithCategory) => void;
    oneditoccurrence?: (tx: TransactionWithCategory) => void;
    onskipoccurrence?: (tx: TransactionWithCategory) => void;
    onendseries?: (tx: TransactionWithCategory) => void;
```

Add after the `canEdit` derived:

```ts
  const isSeries = $derived(
    !!transaction &&
      (transaction.is_recurring ||
        !!transaction.recurring_template_id ||
        !!transaction.projected)
  );
  // Which action's scope chooser is expanded ("edit" | "delete" | null).
  let openScope = $state<"edit" | "delete" | null>(null);
```

- [ ] **Step 3: Render the series panel**

In the scrollable body, after the projected/occurrence info banners block (after the `{/if}` that closes the `{#if transaction.projected}…{:else if transaction.recurring_template_id}…{/if}` around line 201), add:

```svelte
      {#if isSeries && (oneditseries || onendseries || onskipoccurrence || oneditoccurrence)}
        <div class="rounded-xl border border-white/5 bg-slate-900/40 p-3">
          <p class="text-eyebrow mb-2 text-slate-400">{m.transactions_series_title()}</p>
          <div class="flex gap-2">
            <button
              type="button"
              onclick={() => (openScope = openScope === "edit" ? null : "edit")}
              class="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5"
            >
              <Edit size={14} />
              {m.transactions_series_edit()}
            </button>
            <button
              type="button"
              onclick={() => (openScope = openScope === "delete" ? null : "delete")}
              class="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-500/10 py-2 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
            >
              <Trash2 size={14} />
              {m.transactions_series_delete()}
            </button>
          </div>

          {#if openScope === "edit"}
            <div class="mt-2 flex flex-col gap-1.5">
              <button
                type="button"
                onclick={() => {
                  oneditoccurrence?.(transaction!);
                  onclose();
                }}
                class="rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5"
              >
                {m.transactions_series_scope_this()}
              </button>
              <button
                type="button"
                onclick={() => {
                  oneditseries?.(transaction!);
                  onclose();
                }}
                class="rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5"
              >
                {m.transactions_series_scope_all()}
              </button>
            </div>
          {/if}

          {#if openScope === "delete"}
            <div class="mt-2 flex flex-col gap-1.5">
              <button
                type="button"
                onclick={() => {
                  onskipoccurrence?.(transaction!);
                  onclose();
                }}
                class="rounded-lg border border-rose-400/20 px-3 py-2 text-left text-sm text-rose-200 hover:bg-rose-500/10"
              >
                {m.transactions_series_scope_this()}
              </button>
              <button
                type="button"
                onclick={() => {
                  onendseries?.(transaction!);
                  onclose();
                }}
                class="rounded-lg border border-rose-400/20 px-3 py-2 text-left text-sm text-rose-200 hover:bg-rose-500/10"
              >
                {m.transactions_series_scope_following()}
              </button>
            </div>
          {/if}
        </div>
      {/if}
```

- [ ] **Step 4: Reset `openScope` when the sheet target changes**

Add an `$effect` in `<script>` so reopening the sheet for a different row collapses the chooser:

```ts
  $effect(() => {
    void transaction?.id;
    openScope = null;
  });
```

- [ ] **Step 5: Svelte autofixer + checks**

Run `mcp__svelte__svelte-autofixer` on the edited component; fix issues.
Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json`
Expected: 0/0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/transactions/TransactionDetailSheet.svelte messages/pl.json
git commit -m "feat(transactions): calendar-style series panel in the detail sheet"
```

---

### Task 8: Wire series actions in the transactions page

**Files:**
- Modify: `src/routes/transactions/+page.svelte`

**Interfaces:**
- Consumes: `endSeriesFromOccurrence`, `skipOccurrence`, `materializeOccurrence` (Task 4); `fetchTransactionById` (existing in `transactions.ts`); the detail-sheet callbacks (Task 7).
- Produces: wired `oneditseries` / `oneditoccurrence` / `onskipoccurrence` / `onendseries` on `<TransactionDetailSheet>`.

- [ ] **Step 1: Import the series service**

In `src/routes/transactions/+page.svelte` `<script>`, add to imports:

```ts
  import {
    endSeriesFromOccurrence,
    skipOccurrence,
    materializeOccurrence,
  } from "$lib/services/recurring-series";
  import { fetchTransactionById } from "$lib/services/transactions";
```

(If `fetchTransactionById` is already imported from `transactions.ts`, add it to that import instead of duplicating.)

- [ ] **Step 2: Add series mutations**

Add near the existing `deleteMutation` (around line 539):

```ts
  async function resolveTemplate(tx: TransactionWithCategory): Promise<TransactionWithCategory> {
    // The row may be the template itself, or an occurrence/projection pointing at one.
    if (tx.is_recurring && !tx.recurring_template_id) return tx;
    if (tx.recurring_template_id) return fetchTransactionById(tx.recurring_template_id);
    return tx;
  }

  const skipSeriesMutation = createMutation(() => ({
    mutationFn: (tx: TransactionWithCategory) => skipOccurrence(tx),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(m.toast_transaction_deleted());
    },
    onError: (err) => toastError(err),
  }));

  const endSeriesMutation = createMutation(() => ({
    mutationFn: async (tx: TransactionWithCategory) => {
      const template = await resolveTemplate(tx);
      const occurrenceDate = tx.recurring_occurrence_date ?? tx.date.slice(0, 10);
      await endSeriesFromOccurrence({ template, occurrenceDate });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(m.toast_transaction_deleted());
    },
    onError: (err) => toastError(err),
  }));

  async function editSeries(tx: TransactionWithCategory) {
    const template = await resolveTemplate(tx);
    editTarget = template;
    dialogOpen = true;
  }

  async function editOccurrence(tx: TransactionWithCategory) {
    // A projected row has no real row yet — materialize it, then edit that.
    const row = tx.projected
      ? await materializeOccurrence({
          template: await resolveTemplate(tx),
          occurrenceDate: tx.recurring_occurrence_date ?? tx.date.slice(0, 10),
        })
      : tx;
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    editTarget = row;
    dialogOpen = true;
  }
```

(`editTarget` and `dialogOpen` are the existing dialog state from line ~566.)

- [ ] **Step 3: Wire the detail-sheet callbacks**

At the `<TransactionDetailSheet ... />` usage (around line 1056), add props:

```svelte
  oneditseries={(tx) => void editSeries(tx)}
  oneditoccurrence={(tx) => void editOccurrence(tx)}
  onskipoccurrence={(tx) => skipSeriesMutation.mutate(tx)}
  onendseries={(tx) => endSeriesMutation.mutate(tx)}
```

- [ ] **Step 4: Type-check**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json`
Expected: 0/0.

- [ ] **Step 5: Commit**

```bash
git add src/routes/transactions/+page.svelte
git commit -m "feat(transactions): wire calendar-style series actions"
```

---

### Task 9: Forecast running balance column + "Przewidywane saldo" figure

**Files:**
- Modify: `src/routes/transactions/+page.svelte`
- Modify: `src/lib/components/transactions/TransactionTable.svelte`
- Modify: `messages/pl.json`

**Interfaces:**
- Consumes: `forecastRunningBalances` (Task 5), `forecastPosition` (existing), `displayTxs` / `privatePaidTxs` / `cashAnchor` / `showCashView` (existing in the page).
- Produces: `forecastBalanceById: Map<string,number> | undefined` passed to `TransactionTable`; a "Przewidywane saldo" figure near the cash strip.

The existing `runningBalanceById` covers paid rows. We add a forecast map that also covers upcoming + projected rows so each upcoming row's `Saldo` shows the expected balance after it.

- [ ] **Step 1: Add the message string**

In `messages/pl.json`:

```json
  "transactions_forecast_balance": "Przewidywane saldo",
```

Recompile: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`

- [ ] **Step 2: Build the forecast inputs in the page**

In `src/routes/transactions/+page.svelte`, after `privatePaidTxs` (line ~224), add a private upcoming+projected set drawn from the visible `displayTxs` (real upcoming + projected), and a combined forecast map:

```ts
  // Private upcoming + projected rows in the current view, shaped for the engine.
  const privateForecastRows = $derived(
    (displayTxs ?? [])
      .filter((t) => (t.group_id ?? null) === null && t.status === "upcoming")
      .map((t) => ({ id: t.id, type: t.type, amount: t.amount, status: t.status, date: t.date }))
  );

  const forecastBalanceById = $derived(
    showCashView && cashAnchor
      ? forecastRunningBalances(cashAnchor, [...privatePaidTxs, ...privateForecastRows])
      : undefined
  );
```

Import `forecastRunningBalances` from `$lib/services/cash-position` (add to the existing import that already brings `runningBalances`, `livePosition`, `forecastPosition`).

(`displayTxs` is the existing real+projected merge; if its exact name differs, use the page's merged list that feeds `<TransactionTable>`.)

- [ ] **Step 3: Pass the forecast map + show the figure**

At the `<TransactionTable ... />` usage, add (next to the existing `{runningBalanceById}`):

```svelte
      {forecastBalanceById}
```

Near the `<CashPositionStrip ... />` (line ~950), add the expected-balance figure (private scope only):

```svelte
    {#if showCashView && cashAnchor}
      <p class="mt-2 text-xs text-slate-400">
        {m.transactions_forecast_balance()}:
        <span class="font-semibold tabular-nums text-slate-200">{formatCurrency(cashForecast)}</span>
      </p>
    {/if}
```

(`cashForecast` already exists at line 232; `formatCurrency` is already imported.)

- [ ] **Step 4: Accept + render the forecast balance in the table**

In `src/lib/components/transactions/TransactionTable.svelte`, add the prop alongside `runningBalanceById`:

```ts
    forecastBalanceById?: Map<string, number>;
```

In the `Saldo` cell, show the live running balance for paid rows and fall back to the forecast balance for upcoming/projected rows. Find the existing Saldo cell (it reads `runningBalanceById?.get(tx.id)`) and change the value expression to:

```svelte
                {@const bal =
                  runningBalanceById?.get(tx.id) ?? forecastBalanceById?.get(tx.id)}
                {#if bal !== undefined}
                  <span class="tabular-nums {tx.status === 'paid' ? '' : 'text-slate-400 italic'}"
                    >{formatCurrency(bal)}</span
                  >
                {:else}
                  <span class="text-slate-600">—</span>
                {/if}
```

(Match the existing column's markup; the key change is the `?? forecastBalanceById?.get(tx.id)` fallback and the muted style for non-paid rows.)

- [ ] **Step 5: Svelte autofixer + checks**

Run `mcp__svelte__svelte-autofixer` on both edited components; fix issues.
Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json`
Expected: 0/0.

- [ ] **Step 6: Commit**

```bash
git add src/routes/transactions/+page.svelte src/lib/components/transactions/TransactionTable.svelte messages/pl.json
git commit -m "feat(transactions): forecast running balance + expected balance figure"
```

---

### Task 10: RLS regression + E2E coverage

**Files:**
- Modify: `tests/rls/` (if a transactions-recurrence fixture exists; otherwise add a focused case)
- Create/Modify: `e2e/tests/transactions.spec.ts`

**Interfaces:**
- Consumes: the full feature.

- [ ] **Step 1: RLS — confirm `recurrence_end_date` writes obey existing policies**

Add a case to the transactions RLS suite asserting an owner can `update` `recurrence_end_date` on their own template and a non-member cannot. Mirror the nearest existing transactions update test. Run:

```bash
pnpm test:rls
```
Expected: all pass (no policy regressions).

- [ ] **Step 2: E2E — end series "this and following"**

In `e2e/tests/transactions.spec.ts`, add a test (mirror the existing transactions specs' auth + `__e2e_smoke__` tagging): create a monthly recurring expense, open a future occurrence's detail sheet, choose **Usuń → To i przyszłe**, assert the future occurrences disappear from the July+ list while the original stays. Run:

```bash
pnpm test:e2e -- transactions.spec.ts
```
Expected: PASS.

- [ ] **Step 3: E2E — skip one + forecast balance visible**

Add a test: skip a single occurrence (**Usuń → To wystąpienie**) and assert that one slot is gone but later ones remain; and assert the `Saldo` column shows a value on an upcoming row in private scope (`?group=own`). Run:

```bash
pnpm test:e2e -- transactions.spec.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/rls e2e/tests/transactions.spec.ts
git commit -m "test(recurring): RLS + E2E for scoped series actions and forecast balance"
```

---

### Task 11: Full gates + docs

**Files:**
- Modify: `CLAUDE.md` (phase note + immediate next step)

- [ ] **Step 1: Run every gate**

Run (from `apps/web-svelte/`):
```bash
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
pnpm exec svelte-check --tsconfig ./tsconfig.json
pnpm lint
pnpm format:check
pnpm test:unit
pnpm test:rls
```
Expected: svelte-check 0/0; lint 0; format clean; unit + RLS all pass.

- [ ] **Step 2: Confirm migrations replay clean**

Run (repo root): `supabase db reset`
Expected: replays through `20260722000000` with no error.

- [ ] **Step 3: Secret scan on changed files**

Run:
```bash
git diff --name-only origin/dev... | xargs grep -nE "(eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|PRIVATE|password\s*=)" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 4: Update CLAUDE.md**

Add a dated "Recurring series management (Spec 2)" phase note summarizing: `recurrence_end_date` (migration `20260722000000`), calendar-style scoped actions (this / this-and-following; edit this/all), forecast running balance (private). Update "Immediate next step" to: open PR; apply migration `20260722000000` after merge; Spec 3 = group-scope cash position.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): recurring series management (Spec 2) phase note"
```

---

## Self-Review

**Spec coverage:**
- Schema `recurrence_end_date` + view refresh → Task 1. ✓
- Projection/materialization respect end date → Task 3 (materialize inherits via `projectRecurringOccurrences`). ✓
- Series panel (calendar scopes) → Tasks 7 + 8. ✓
- Edit this/all (reuse dialog) → Tasks 6 + 8. ✓
- Delete this / this-and-following → Tasks 4 + 7 + 8. ✓
- Forecast running balance + end figure → Tasks 5 + 9. ✓
- Services (`recurring-series.ts`, type plumbing) → Tasks 2 + 4. ✓
- Tests (unit/RLS/E2E) → Tasks 3,4,5 (unit) + 10 (RLS/E2E). ✓
- Private-scope-only constraint → Task 9 (`showCashView` gate). ✓
- Won't-do (edit this-and-following) / Spec 3 (group scope) → excluded. ✓

**Placeholder scan:** No TBD/TODO; every code step shows code; commands have expected output.

**Type consistency:** `endSeriesFromOccurrence({template, occurrenceDate})`, `skipOccurrence(tx)`, `materializeOccurrence({template, occurrenceDate})`, `forecastRunningBalances(anchor, txs)`, `dayBefore(iso)`, `isFutureUpcomingOccurrence(tx, templateId, fromDate)` — names match between definition (Tasks 4,5) and use (Tasks 8,9). Detail-sheet callback names (`oneditseries`/`oneditoccurrence`/`onskipoccurrence`/`onendseries`) match between Task 7 (props) and Task 8 (wiring).

## Risk notes (carried from spec)
- "Edit this occurrence" on a projected row materializes first via upsert (conflict key `user_id,recurring_template_id,recurring_occurrence_date`) — no double-create.
- Forecast running balance must not double-count: `displayTxs` already dedups projected vs real (Spec 1 dedup); the `status === "upcoming"` filter takes real upcoming + projected (projected rows are status `upcoming`), and real materialized occurrences replace their projection in `displayTxs`, so each slot appears once.
- `recurring_template_id` self-FK is `ON DELETE SET NULL`; v1 never deletes templates or past rows, so history is safe. Skip-delete of a materialized occurrence sets `recurring_occurrence_skips.skipped_transaction_id` to NULL (its FK is `ON DELETE SET NULL`) — the skip row survives, keeping the slot suppressed.
```
