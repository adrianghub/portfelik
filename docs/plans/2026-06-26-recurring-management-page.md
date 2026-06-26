# Recurring Management Page (`/recurring`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dedicated `/recurring` page listing active recurring series with edit + end-from-today actions, reached from the dashboard and transactions (not a nav item).

**Architecture:** A pure core (`buildRecurringSeriesList`) turns recurring templates into display summaries (cadence, next occurrence, range, scope). A new `src/routes/recurring/+page.svelte` renders them; edit reuses `TransactionDialog` (template), end reuses Spec 2's `endSeriesFromOccurrence`. Entry links live on the dashboard Status band and the transactions header. No schema change.

**Tech Stack:** SvelteKit (adapter-static, Svelte 5 runes), Supabase (PostgREST + RLS), TanStack Query v6, Paraglide v2 i18n, Vitest, Playwright.

## Global Constraints

- svelte-check 0/0 (`pnpm exec svelte-check --tsconfig ./tsconfig.json`); `pnpm lint` 0; `pnpm format:check` clean.
- Recompile Paraglide after any `messages/pl.json` edit: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`. `src/lib/paraglide/**` is gitignored.
- All UTC date math; dates compared date-only (`YYYY-MM-DD`).
- `createMutation` is NOT a store — use `mutation.mutate(...)`, `mutation.isPending`.
- Run Svelte MCP autofixer (`mcp__svelte__svelte-autofixer`) on every new/edited `.svelte` component.
- Page is NOT added to `Navigation.svelte`. Entry only from dashboard + transactions.
- v1 manages existing series only; active series only; non-destructive end-from-today; scope badge is Prywatne/Wspólne (no group-name lookup). Edit/end gated by `canManageTransaction`.
- All paths relative to `apps/web-svelte/`.

---

### Task 1: Pure core — series summaries

**Files:**
- Modify: `src/lib/services/recurring-series.ts`
- Test: `tests/unit/recurring-series.spec.ts`

**Interfaces:**
- Consumes: `occurrenceDates` (from `recurring-forecast.ts`), `recurrenceSummary` (from `lib/recurrence.ts`), `TransactionWithCategory`.
- Produces:
  - `isActiveRecurringSeries(t: TransactionWithCategory, today: string): boolean`
  - `summarizeRecurringSeries(t: TransactionWithCategory, now?: Date): RecurringSeriesSummary`
  - `buildRecurringSeriesList(templates: TransactionWithCategory[], now?: Date): RecurringSeriesSummary[]`
  - `interface RecurringSeriesSummary { id; title; type; amount; categoryName; groupId; cadence; nextDate; startDate; endDate }`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/recurring-series.spec.ts` (the file already has a `template()` factory in the `materializeOccurrence` describe — define a local one here too so this block is self-contained):

```ts
import {
  isActiveRecurringSeries,
  summarizeRecurringSeries,
  buildRecurringSeriesList,
} from "$lib/services/recurring-series";

function tmpl(over: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return {
    id: "t1",
    amount: 200,
    currency: "PLN",
    counterparty: "Najem",
    description: "Czynsz",
    date: "2026-01-10",
    type: "expense",
    status: "paid",
    category_id: "c1",
    user_id: "u1",
    is_recurring: true,
    recurring_day: 10,
    recurrence_frequency: "monthly",
    recurrence_interval: 1,
    recurrence_weekday: null,
    recurrence_month: null,
    recurring_template_id: null,
    recurring_occurrence_date: null,
    recurrence_end_date: null,
    group_id: null,
    created_at: "",
    updated_at: "",
    category_name: "Mieszkanie",
    category_type: "expense",
    is_hold: false,
    ...over,
  };
}

const NOW = new Date("2026-06-26T00:00:00.000Z");

describe("isActiveRecurringSeries", () => {
  it("is active when open-ended", () => {
    expect(isActiveRecurringSeries(tmpl(), "2026-06-26")).toBe(true);
  });
  it("is active when end date is today or later", () => {
    expect(isActiveRecurringSeries(tmpl({ recurrence_end_date: "2026-06-26" }), "2026-06-26")).toBe(
      true
    );
  });
  it("is inactive once the end date has passed", () => {
    expect(isActiveRecurringSeries(tmpl({ recurrence_end_date: "2026-06-25" }), "2026-06-26")).toBe(
      false
    );
  });
  it("is inactive without a frequency", () => {
    expect(isActiveRecurringSeries(tmpl({ recurrence_frequency: null }), "2026-06-26")).toBe(false);
  });
});

describe("summarizeRecurringSeries", () => {
  it("derives title, cadence, range, scope and the next occurrence >= today", () => {
    const s = summarizeRecurringSeries(tmpl(), NOW);
    expect(s.title).toBe("Najem");
    expect(s.amount).toBe(200);
    expect(s.categoryName).toBe("Mieszkanie");
    expect(s.groupId).toBeNull();
    expect(s.startDate).toBe("2026-01-10");
    expect(s.endDate).toBeNull();
    expect(s.cadence.length).toBeGreaterThan(0);
    expect(s.nextDate).toBe("2026-07-10"); // monthly on the 10th, next after 2026-06-26
  });
  it("falls back to description when counterparty is empty", () => {
    expect(summarizeRecurringSeries(tmpl({ counterparty: null }), NOW).title).toBe("Czynsz");
  });
  it("returns null nextDate when the series ends before the next occurrence", () => {
    const s = summarizeRecurringSeries(tmpl({ recurrence_end_date: "2026-07-01" }), NOW);
    expect(s.nextDate).toBeNull();
  });
});

describe("buildRecurringSeriesList", () => {
  it("keeps active series, drops ended, sorts by nextDate asc (nulls last)", () => {
    const list = buildRecurringSeriesList(
      [
        tmpl({ id: "later", recurring_day: 20 }),
        tmpl({ id: "ended", recurrence_end_date: "2026-01-01" }),
        tmpl({ id: "sooner", recurring_day: 5, date: "2026-01-05" }),
      ],
      NOW
    );
    expect(list.map((s) => s.id)).toEqual(["sooner", "later"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --config vitest.unit.config.ts tests/unit/recurring-series.spec.ts`
Expected: FAIL — the three functions are not exported yet.

- [ ] **Step 3: Implement the core**

In `src/lib/services/recurring-series.ts`, add imports at the top (alongside existing imports):

```ts
import { occurrenceDates } from "$lib/services/recurring-forecast";
import { recurrenceSummary } from "$lib/recurrence";
```

Append:

```ts
export interface RecurringSeriesSummary {
  id: string;
  title: string;
  type: "income" | "expense";
  amount: number;
  categoryName: string;
  groupId: string | null;
  cadence: string;
  nextDate: string | null;
  startDate: string;
  endDate: string | null;
}

const DAY_MS = 86_400_000;

/** Active = a generating template whose end date (if any) has not passed. */
export function isActiveRecurringSeries(t: TransactionWithCategory, today: string): boolean {
  if (!t.is_recurring || !t.recurrence_frequency) return false;
  return t.recurrence_end_date == null || t.recurrence_end_date >= today;
}

/** Display summary for one recurring template. Pure; `now` injectable. */
export function summarizeRecurringSeries(
  t: TransactionWithCategory,
  now: Date = new Date()
): RecurringSeriesSummary {
  const today = now.toISOString().slice(0, 10);
  const todayMs = new Date(`${today}T00:00:00.000Z`).getTime();
  // occurrenceDates is exclusive on its lower bound, so start a day before today
  // to include an occurrence landing exactly today; look ~13 months ahead.
  const upcoming = occurrenceDates(t, todayMs - DAY_MS, todayMs + 400 * DAY_MS);
  const nextDate = upcoming.length > 0 ? upcoming[0].toISOString().slice(0, 10) : null;
  return {
    id: t.id,
    title: t.counterparty?.trim() || t.description,
    type: t.type,
    amount: Math.abs(Number(t.amount)),
    categoryName: t.category_name,
    groupId: t.group_id,
    cadence: recurrenceSummary({
      frequency: t.recurrence_frequency,
      interval: t.recurrence_interval,
      weekday: t.recurrence_weekday,
      day: t.recurring_day,
      month: t.recurrence_month,
    }),
    nextDate,
    startDate: t.date.slice(0, 10),
    endDate: t.recurrence_end_date,
  };
}

/** Active series only, summarized, sorted by next occurrence (nulls last). */
export function buildRecurringSeriesList(
  templates: TransactionWithCategory[],
  now: Date = new Date()
): RecurringSeriesSummary[] {
  const today = now.toISOString().slice(0, 10);
  return templates
    .filter((t) => isActiveRecurringSeries(t, today))
    .map((t) => summarizeRecurringSeries(t, now))
    .sort((a, b) => {
      if (a.nextDate === b.nextDate) return 0;
      if (a.nextDate === null) return 1;
      if (b.nextDate === null) return -1;
      return a.nextDate.localeCompare(b.nextDate);
    });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run --config vitest.unit.config.ts tests/unit/recurring-series.spec.ts`
Expected: PASS. Then `pnpm test:unit` — full suite green.

- [ ] **Step 5: Type-check + commit**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json` (0/0).
```bash
git add src/lib/services/recurring-series.ts tests/unit/recurring-series.spec.ts
git commit -m "feat(recurring): series summary core for the management page"
```

---

### Task 2: The `/recurring` page

**Files:**
- Create: `src/routes/recurring/+page.svelte`
- Modify: `messages/pl.json`

**Interfaces:**
- Consumes: `buildRecurringSeriesList` (Task 1), `fetchRecurringTemplates`, `fetchTransactionById` (transactions.ts), `endSeriesFromOccurrence` (recurring-series.ts), `fetchMyGroupRoles` (groups.ts), `canManageTransaction` (transaction-permissions.ts), `TransactionDialog`, `ConfirmDialog`, `QueryError`.
- Produces: the route. The page invalidates `["recurring-templates"]` after edit/end so the list refreshes (TransactionDialog only invalidates `["transactions"]`).

- [ ] **Step 1: Add message strings**

In `messages/pl.json` add:

```json
  "recurring_page_title": "Transakcje cykliczne",
  "recurring_page_subtitle": "Twoje aktywne serie. Edytuj lub zakończ.",
  "recurring_next": "następne",
  "recurring_range": "zakres",
  "recurring_open_ended": "bezterminowo",
  "recurring_scope_private": "Prywatne",
  "recurring_scope_shared": "Wspólne",
  "recurring_action_edit": "Edytuj serię",
  "recurring_action_end": "Zakończ od dziś",
  "recurring_end_confirm": "Zakończyć tę serię od dziś? Przyszłe wystąpienia znikną; historia zostaje.",
  "recurring_empty": "Nie masz aktywnych transakcji cyklicznych.",
  "recurring_empty_hint": "Serię tworzysz, oznaczając transakcję jako cykliczną.",
  "recurring_ended_toast": "Serię zakończono.",
  "recurring_entry": "Cykliczne"
```

Recompile: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`

- [ ] **Step 2: Create the page**

Create `src/routes/recurring/+page.svelte`:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { toast } from "svelte-sonner";
  import { Pencil, CalendarX } from "lucide-svelte";
  import * as m from "$lib/paraglide/messages";
  import { supabase } from "$lib/supabase";
  import { fetchRecurringTemplates, fetchTransactionById } from "$lib/services/transactions";
  import { buildRecurringSeriesList, endSeriesFromOccurrence } from "$lib/services/recurring-series";
  import { fetchMyGroupRoles } from "$lib/services/groups";
  import { canManageTransaction } from "$lib/services/transaction-permissions";
  import TransactionDialog from "$lib/components/transactions/TransactionDialog.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import QueryError from "$lib/components/ui/QueryError.svelte";
  import { toastError } from "$lib/toast-error";
  import { formatCurrency, formatDate } from "$lib/utils";
  import type { Transaction, TransactionWithCategory } from "$lib/types";

  const queryClient = useQueryClient();

  let userId = $state<string | null>(null);
  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user.id ?? null;
  });

  const templatesQuery = createQuery(() => ({
    queryKey: ["recurring-templates"],
    queryFn: fetchRecurringTemplates,
  }));

  const groupRolesQuery = createQuery(() => ({
    queryKey: ["my-group-roles"],
    queryFn: fetchMyGroupRoles,
    enabled: !!userId,
  }));

  const templates = $derived(templatesQuery.data ?? []);
  const series = $derived(buildRecurringSeriesList(templates));
  const byId = $derived(new Map(templates.map((t) => [t.id, t])));

  function canManage(id: string): boolean {
    const t = byId.get(id);
    if (!t || !userId) return false;
    return canManageTransaction(t, userId, groupRolesQuery.data ?? new Map());
  }

  // Edit reuses the transaction dialog loaded with the template.
  let dialogOpen = $state(false);
  let editTarget = $state<Transaction | null>(null);

  function openEdit(id: string) {
    const t = byId.get(id);
    if (t) {
      editTarget = t;
      dialogOpen = true;
    }
  }

  async function closeDialog() {
    dialogOpen = false;
    editTarget = null;
    await queryClient.invalidateQueries({ queryKey: ["recurring-templates"] });
  }

  // End-from-today.
  let endTargetId = $state<string | null>(null);
  const endMutation = createMutation(() => ({
    mutationFn: async (id: string) => {
      const template = await fetchTransactionById(id);
      await endSeriesFromOccurrence({
        template,
        occurrenceDate: new Date().toISOString().slice(0, 10),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["recurring-templates"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions", "recurring-skips"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress-list"] });
      toast.success(m.recurring_ended_toast());
      endTargetId = null;
    },
    onError: (err) => toastError(err),
  }));
</script>

<div class="mx-auto w-full max-w-3xl px-4 py-6">
  <header class="mb-5">
    <h1 class="text-xl font-semibold text-slate-100">{m.recurring_page_title()}</h1>
    <p class="mt-1 text-sm text-slate-400">{m.recurring_page_subtitle()}</p>
  </header>

  {#if templatesQuery.isError}
    <QueryError error={templatesQuery.error} onRetry={() => templatesQuery.refetch()} />
  {:else if templatesQuery.isPending}
    <div class="space-y-2">
      {#each Array(3) as _, i (i)}
        <div class="h-20 animate-pulse rounded-xl border border-white/5 bg-slate-900/40"></div>
      {/each}
    </div>
  {:else if series.length === 0}
    <div class="rounded-xl border border-white/5 bg-slate-900/40 p-6 text-center">
      <p class="text-sm text-slate-300">{m.recurring_empty()}</p>
      <p class="mt-1 text-xs text-slate-500">{m.recurring_empty_hint()}</p>
    </div>
  {:else}
    <ul class="space-y-2">
      {#each series as s (s.id)}
        <li class="rounded-xl border border-white/5 bg-slate-900/40 p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="truncate font-medium text-slate-100">{s.title}</span>
                <span
                  class="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400"
                >
                  {s.groupId ? m.recurring_scope_shared() : m.recurring_scope_private()}
                </span>
              </div>
              <p class="mt-0.5 truncate text-xs text-slate-400">{s.categoryName} · {s.cadence}</p>
              <p class="mt-1 text-xs text-slate-500">
                {m.recurring_next()}: {s.nextDate ? formatDate(s.nextDate) : "—"} ·
                {m.recurring_range()}: {formatDate(s.startDate)} → {s.endDate
                  ? formatDate(s.endDate)
                  : m.recurring_open_ended()}
              </p>
            </div>
            <span
              class="shrink-0 font-semibold tabular-nums {s.type === 'income'
                ? 'text-emerald-400'
                : 'text-rose-400'}"
            >
              {s.type === "income" ? "+" : "−"}{formatCurrency(s.amount)}
            </span>
          </div>

          {#if canManage(s.id)}
            <div class="mt-3 flex gap-2">
              <button
                type="button"
                onclick={() => openEdit(s.id)}
                class="focus-visible:ring-accent inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
              >
                <Pencil size={13} />
                {m.recurring_action_edit()}
              </button>
              <button
                type="button"
                onclick={() => (endTargetId = s.id)}
                class="focus-visible:ring-accent inline-flex items-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-500/20 focus-visible:ring-2 focus-visible:outline-none"
              >
                <CalendarX size={13} />
                {m.recurring_action_end()}
              </button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<TransactionDialog open={dialogOpen} onclose={closeDialog} initial={editTarget} />

<ConfirmDialog
  open={endTargetId !== null}
  message={m.recurring_end_confirm()}
  pending={endMutation.isPending}
  onconfirm={() => endMutation.mutate(endTargetId!)}
  onclose={() => (endTargetId = null)}
/>
```

- [ ] **Step 3: Svelte autofixer + checks**

Run `mcp__svelte__svelte-autofixer` on `+page.svelte`; fix issues. Then:
Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json` (0/0); `pnpm lint` (0); `pnpm format` then `pnpm format:check`.

- [ ] **Step 4: Manual smoke**

Run `pnpm dev`, log in (`user@portfelik.test` / same), seed if needed (`pnpm seed:local`), visit `/recurring`. Confirm: list renders for a recurring series (or the empty state), Edytuj opens the dialog, Zakończ shows the confirm. (E2E in Task 4 automates this.)

- [ ] **Step 5: Commit**

```bash
git add src/routes/recurring/+page.svelte messages/pl.json
git commit -m "feat(recurring): /recurring management page (list + edit + end)"
```

---

### Task 3: Entry points (dashboard + transactions)

**Files:**
- Modify: `src/routes/dashboard/+page.svelte`
- Modify: `src/routes/transactions/+page.svelte`

**Interfaces:**
- Consumes: `buildRecurringSeriesList` (Task 1), the dashboard's existing `recurringTemplatesQuery`, `m.recurring_entry` (Task 2).
- Produces: two links to `/recurring`. No new exports.

- [ ] **Step 1: Dashboard — active count + link in the Status band**

In `src/routes/dashboard/+page.svelte`, add the import (with the other service imports):

```ts
  import { buildRecurringSeriesList } from "$lib/services/recurring-series";
```

Add a derived count near the other `$derived` declarations:

```ts
  const activeRecurringCount = $derived(
    buildRecurringSeriesList(recurringTemplatesQuery.data ?? []).length
  );
```

In the template, the Status band heading is:
```svelte
  <h2 class="mb-2 text-sm font-medium text-slate-400">{m.dashboard_status_band()}</h2>
```
Replace it with a row that keeps the heading and adds the link (only when there are active series):
```svelte
  <div class="mb-2 flex items-center justify-between gap-2">
    <h2 class="text-sm font-medium text-slate-400">{m.dashboard_status_band()}</h2>
    {#if activeRecurringCount > 0}
      <a
        href="/recurring"
        class="hover:text-accent text-xs font-medium text-slate-400 transition-colors"
      >
        {m.recurring_entry()} ({activeRecurringCount})
      </a>
    {/if}
  </div>
```

- [ ] **Step 2: Transactions — header action**

In `src/routes/transactions/+page.svelte`, the header action group is:
```svelte
    <div class="flex shrink-0 items-center gap-2">
      <button
        onclick={openAdd}
        ...
      >
        + {m.transaction_manual_add()}
      </button>
      <TransactionDataActions exportDisabled={!filteredTxs?.length} onexport={handleExport} />
    </div>
```
Add a `/recurring` link as the first child of that group (before the add button):
```svelte
      <a
        href="/recurring"
        class="focus-visible:ring-accent hidden h-9 items-center gap-1.5 rounded-full border border-white/10 px-3.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none md:inline-flex"
      >
        {m.recurring_entry()}
      </a>
```

- [ ] **Step 3: Svelte autofixer + checks**

Run `mcp__svelte__svelte-autofixer` on both edited pages; fix issues. Then svelte-check 0/0, lint 0, `pnpm format` + `format:check`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/dashboard/+page.svelte src/routes/transactions/+page.svelte
git commit -m "feat(recurring): entry links from dashboard + transactions"
```

---

### Task 4: E2E + gates

**Files:**
- Create: `e2e/tests/recurring.spec.ts`

**Interfaces:**
- Consumes: the full feature.

- [ ] **Step 1: Write the E2E spec**

Create `e2e/tests/recurring.spec.ts`, mirroring the auth/mock setup of `e2e/tests/transactions.spec.ts` (reuse its login helper + Supabase route-mock pattern; check that file for the exact `beforeEach` and mocking utilities). Cover:
1. Seed/mocks return one active monthly recurring template. Visit `/recurring`; assert the series title, cadence text, and a "następne" date render.
2. Click "Edytuj serię" → the transaction dialog opens (assert a dialog field is visible).
3. Click "Zakończ od dziś" → confirm in the `ConfirmDialog` → assert the row leaves the list (or the empty state appears) and a success toast shows.
4. From `/transactions`, the header "Cykliczne" link navigates to `/recurring`.
5. From `/dashboard` (with an active series), the "Cykliczne (N)" link navigates to `/recurring`.

Use the existing specs' selectors (`page.locator("aside")`, role-based queries) as the pattern.

- [ ] **Step 2: Run the E2E spec**

Run: `pnpm test:e2e recurring.spec.ts`
Expected: all cases pass. (Run `pnpm test:e2e:install` first if Chromium is missing.)

- [ ] **Step 3: Full gates**

Run from `apps/web-svelte/`:
```bash
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
pnpm exec svelte-check --tsconfig ./tsconfig.json
pnpm lint
pnpm format:check
pnpm test:unit
```
Expected: svelte-check 0/0; lint 0; format clean; unit all pass.

- [ ] **Step 4: Secret scan**

Run:
```bash
git diff --name-only origin/dev... | xargs grep -nE "(eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|PRIVATE|password\s*=)" || echo "clean"
```
Expected: `clean`.

- [ ] **Step 5: Update CLAUDE.md + commit**

Add a dated "Recurring management page (`/recurring`)" phase note (list + edit + end-from-today; entry from dashboard + transactions; not in nav). Update "Immediate next step".
```bash
git add e2e/tests/recurring.spec.ts CLAUDE.md
git commit -m "test(recurring): E2E for the management page + entry links"
```

---

## Self-Review

**Spec coverage:**
- Pure core (`isActiveRecurringSeries`/`summarizeRecurringSeries`/`buildRecurringSeriesList`) → Task 1. ✓
- Page route, list content, loading/empty/error → Task 2. ✓
- Edit (template dialog) + end-from-today (ConfirmDialog + `endSeriesFromOccurrence`) + invalidation → Task 2. ✓
- Permission gating (`canManageTransaction`) → Task 2 (`canManage`). ✓
- Prywatne/Wspólne badge (no group-name query) → Task 2. ✓
- Entry points dashboard + transactions, not in nav → Task 3. ✓
- Active-only, sorted by nextDate → Task 1. ✓
- Tests unit + E2E → Tasks 1 + 4. ✓
- Out of scope (create-new, ended view, full delete) → not present. ✓

**Placeholder scan:** Task 4 step 1 references the existing transactions E2E's helpers rather than copying them verbatim — this is intentional (reuse the project's auth/mock harness, which the implementer must read); every other step has concrete code/commands.

**Type consistency:** `RecurringSeriesSummary` fields (`id/title/type/amount/categoryName/groupId/cadence/nextDate/startDate/endDate`) match between Task 1 (definition) and Task 2 (consumption). `endSeriesFromOccurrence({ template, occurrenceDate })`, `buildRecurringSeriesList(templates, now?)`, `canManageTransaction(tx, userId, roles)` used consistently. `TransactionDialog` props (`open/onclose/initial`) match its definition. `ConfirmDialog` props (`open/message/onconfirm/onclose/pending`) match its definition.

## Risk notes
- `TransactionDialog` invalidates `["transactions"]`, not `["recurring-templates"]`; the page re-invalidates `["recurring-templates"]` on dialog close (Task 2 `closeDialog`) so edits reflect.
- `nextDate` relies on `occurrenceDates` honoring `recurrence_end_date` (Spec 2) — pinned by the "ends before next occurrence" unit test (Task 1).
- The dashboard count reuses `recurringTemplatesQuery` (wired since Spec 1); if absent on the dashboard, add `createQuery(["recurring-templates"], fetchRecurringTemplates)` there.
