# Trust Simplification (Kokpit / Plany / Cash / Goal Detail) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Kokpit and `/plans` stop alarming on goal allocations and engine footnotes — consumption-only insight/chart math, honest month bilans, editable cash strip, and a calmer goal-detail surface — without changing ledger storage or schema.

**Architecture:** Extend `goal-spending.ts` with a shared allocation predicate; feed that into `computeSpendingInsight` and into history bucketing before `stackCategoryHistory`. Slim `SurplusCard` + `buildPlanningQueueActions` to cashflow + useful chips only. Add a compact `DateRangePicker` variant and a Transakcje cash-anchor sheet over existing `upsertPrivateCashPosition`. Goal detail is copy/layout only.

**Tech Stack:** SvelteKit (adapter-static, Svelte 5 runes), TanStack Query v6, Paraglide v2, Vitest, Playwright. No migrations.

**Spec:** `docs/specs/2026-07-17-trust-simplification-kokpit-plans-design.md`

## Global Constraints

- Paths relative to `apps/web-svelte/` unless noted.
- After `messages/pl.json` edits: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`.
- Gates before claiming done: `pnpm exec svelte-check --tsconfig ./tsconfig.json` (0/0), `pnpm lint`, `pnpm format:check`, `pnpm test:unit`, touched E2E, secret scan on changed files.
- Ledger Bilans ring stays full outflows (known residual). Insight + chart stack = consumption.
- `createMutation` is not a store.
- Prefer one branch with **three commits** matching Tasks 1–3 / 4–5 / 6 (Kokpit → Plans+cash → Goal detail).

## File map

| File | Responsibility |
| --- | --- |
| `src/lib/services/goal-spending.ts` | `isAllocationExpense`, `partitionLedgerExpenses` (consumption vs allocation) |
| `src/lib/services/spending-insight.ts` | Consumption-only insight when exclusion args passed |
| `src/lib/services/period-history.ts` | Optional: document that callers must pass consumption txs; no API change required if dashboard filters first |
| `src/lib/services/planning-queue.ts` | Remove debt-rata action |
| `src/lib/components/transactions/DateRangePicker.svelte` | `variant?: "default" \| "chip"` |
| `src/lib/components/dashboard/*` | Toolbar chip variant, hide bad savings %, drop movers block, labeled settle badge, chart allocation footer |
| `src/routes/dashboard/+page.svelte` | Wire exclusion set into insight + history txs |
| `src/lib/components/plans/SurplusCard.svelte` | Bilans-only UI |
| `src/lib/components/plans/NetWorthHero.svelte` | One privacy line; drop goal hint |
| `src/lib/components/transactions/CashPositionStrip.svelte` + `transactions/+page.svelte` | Edit sheet + link |
| `src/lib/components/plans/SavePlanDetail.svelte` + `plans/[id]/+page.svelte` | Hero/CTA/Wpłaty polish |
| `messages/pl.json` | New/updated copy; prune dead surplus keys |

---

### Task 1: Allocation partition + spending insight (TDD)

**Files:**
- Modify: `src/lib/services/goal-spending.ts`
- Modify: `src/lib/services/spending-insight.ts`
- Modify: `tests/unit/goal-spending.spec.ts`
- Modify: `tests/unit/spending-insight.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export function isAllocationExpense(
    tx: Pick<TransactionWithCategory, "id" | "type" | "category_id">,
    saveLinkedIds: ReadonlySet<string>,
    celeCategoryId?: string | null
  ): boolean;

  export function partitionLedgerExpenses(
    txs: TransactionWithCategory[],
    saveLinkedIds: ReadonlySet<string>,
    celeCategoryId?: string | null
  ): { consumption: TransactionWithCategory[]; allocation: TransactionWithCategory[] };
  ```
- Extends `computeSpendingInsight` input with optional:
  ```ts
  saveLinkedIds?: ReadonlySet<string>;
  celeCategoryId?: string | null;
  ```
  When either is provided, filter expenses through `isAllocationExpense` before category/spent math (same semantics as `computeGoalSpendingSplit`).

- [ ] **Step 1: Write failing tests for partition**

Append to `tests/unit/goal-spending.spec.ts`:

```ts
import { isAllocationExpense, partitionLedgerExpenses } from "$lib/services/goal-spending";

it("treats save-linked and Cele category expenses as allocation", () => {
  const linked = new Set(["a"]);
  expect(
    isAllocationExpense(
      { id: "a", type: "expense", category_id: "other" },
      linked,
      "cele"
    )
  ).toBe(true);
  expect(
    isAllocationExpense(
      { id: "b", type: "expense", category_id: "cele" },
      linked,
      "cele"
    )
  ).toBe(true);
  expect(
    isAllocationExpense(
      { id: "c", type: "expense", category_id: "food" },
      linked,
      "cele"
    )
  ).toBe(false);
});

it("partitionLedgerExpenses splits consumption vs allocation", () => {
  const txs = [
    { id: "1", type: "expense", category_id: "cele", amount: 100, category_name: "Cele" },
    { id: "2", type: "expense", category_id: "food", amount: 50, category_name: "Jedzenie" },
  ] as TransactionWithCategory[];
  const { consumption, allocation } = partitionLedgerExpenses(txs, new Set(), "cele");
  expect(allocation.map((t) => t.id)).toEqual(["1"]);
  expect(consumption.map((t) => t.id)).toEqual(["2"]);
});
```

(Use the file’s existing tx factory if present; keep required fields valid.)

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd apps/web-svelte && pnpm exec vitest run tests/unit/goal-spending.spec.ts
```

Expected: FAIL — exports missing.

- [ ] **Step 3: Implement helpers in `goal-spending.ts`**

```ts
export function isAllocationExpense(
  tx: Pick<TransactionWithCategory, "id" | "type" | "category_id">,
  saveLinkedIds: ReadonlySet<string>,
  celeCategoryId?: string | null
): boolean {
  if (tx.type !== "expense") return false;
  if (saveLinkedIds.has(tx.id)) return true;
  return Boolean(celeCategoryId && tx.category_id === celeCategoryId);
}

export function partitionLedgerExpenses(
  txs: TransactionWithCategory[],
  saveLinkedIds: ReadonlySet<string>,
  celeCategoryId?: string | null
): { consumption: TransactionWithCategory[]; allocation: TransactionWithCategory[] } {
  const ledger = ledgerTransactions(txs);
  const consumption: TransactionWithCategory[] = [];
  const allocation: TransactionWithCategory[] = [];
  for (const tx of ledger) {
    if (tx.type !== "expense") continue;
    if (isAllocationExpense(tx, saveLinkedIds, celeCategoryId)) allocation.push(tx);
    else consumption.push(tx);
  }
  return { consumption, allocation };
}
```

Refactor `computeGoalSpendingSplit` loop to call `isAllocationExpense` (DRY).

- [ ] **Step 4: Failing insight tests**

In `tests/unit/spending-insight.spec.ts`, add a case where current period has Cele 4000 + food 200, previous food 200 only; with `celeCategoryId` set, expect `spent === 200`, no Cele category row, and `spentDeltaPct` not reflecting the 4000 spike.

- [ ] **Step 5: Implement insight filter**

At start of `computeSpendingInsight`, if `saveLinkedIds` or `celeCategoryId` is passed:

```ts
const exclude = (list: TransactionWithCategory[]) =>
  list.filter((t) => !isAllocationExpense(t, saveLinkedIds ?? new Set(), celeCategoryId));
```

Apply to current/previous/rolling **before** `ledgerTransactions` or after — but only expenses are excluded; keep incomes. Prefer: `ledgerTransactions` then filter expenses that are allocations out of the expense-bearing lists used for spent/categories (incomes stay for `net` if still computed — `net` on insight is secondary; keep behavior consistent with filtered spent).

Clarification for implementer: after exclusion, `spent` / categories / movers / anomalies / `biggestExpenses` use consumption expenses only. `net` = income − consumption spent (do not subtract Cele).

- [ ] **Step 6: Run unit tests — PASS**

```bash
pnpm exec vitest run tests/unit/goal-spending.spec.ts tests/unit/spending-insight.spec.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/web-svelte/src/lib/services/goal-spending.ts \
  apps/web-svelte/src/lib/services/spending-insight.ts \
  apps/web-svelte/tests/unit/goal-spending.spec.ts \
  apps/web-svelte/tests/unit/spending-insight.spec.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): exclude goal allocations from spending insight

Cele and save-linked expenses are allocations, not consumption alarms.
EOF
)"
```

---

### Task 2: Wire Kokpit insight, chart, ratio, toolbar, badge, drop movers

**Files:**
- Modify: `src/routes/dashboard/+page.svelte`
- Modify: `src/lib/components/dashboard/DashboardBalanceHero.svelte`
- Modify: `src/lib/components/dashboard/DashboardSpendingInsight.svelte`
- Modify: `src/lib/components/dashboard/SpendingCategoryBreakdown.svelte`
- Modify: `src/lib/components/dashboard/DashboardActions.svelte` (remove redundant Cele name filter if engine already excludes)
- Modify: `src/lib/components/dashboard/DashboardViewToolbar.svelte`
- Modify: `src/lib/components/transactions/DateRangePicker.svelte`
- Modify: `src/lib/components/dashboard/charts/SpendHistoryChart.svelte`
- Modify: `src/lib/components/dashboard/DashboardPlanProgress.svelte`
- Modify: `messages/pl.json` (+ Paraglide compile)
- Test: extend `tests/unit/dashboard-spending-insight-card.spec.ts` if it asserts movers; add/adjust chart unit if any; E2E smoke later in Task 7

**Interfaces:**
- Consumes: `partitionLedgerExpenses`, extended `computeSpendingInsight`, existing `saveLinkedIds` query + `resolveCeleCategoryId`
- `DateRangePicker` gains `variant?: "default" | "chip"` (default `"default"`)

- [ ] **Step 1: Compact DateRangePicker variant**

Add prop `variant = "default"`. When `variant === "chip"`, closed trigger uses same classes as dashboard period chips: `h-auto rounded-full px-3.5 py-1.5 text-xs`, border `border-white/5` when inactive look, no `h-9` / `bg-slate-900/60` chrome that makes it taller. `DashboardViewToolbar` passes `variant="chip"`. Transakcje page leaves default.

- [ ] **Step 2: Savings ratio display**

In `dashboard/+page.svelte`, derive display ratio:

```ts
const savingsRatioDisplay = $derived.by(() => {
  if (savingsRatio === null || !summary) return null;
  if (Math.abs(savingsRatio) === 100 && Math.abs(summary.net) > summary.total_income) {
    return null;
  }
  return savingsRatio;
});
```

Pass `savingsRatioDisplay` into `DashboardBalanceHero`. Remove both `{m.dashboard_savings_na()}` branches (desktop ring + side panel) — render nothing when null.

- [ ] **Step 3: Wire insight exclusion**

Where `computeSpendingInsight({...})` is called, pass `saveLinkedIds: saveLinkedIdsQuery.data ?? new Set()` and `celeCategoryId: resolveCeleCategoryId(categories)`.

- [ ] **Step 4: Drop SZCZEGÓŁY / movers from card**

In `SpendingCategoryBreakdown.svelte`, remove the movers preview block + movers dialog (or stop rendering when a new prop `showMovers={false}` default false). Keep categories list + one “Zobacz więcej”. Update `DashboardSpendingInsight` accordingly. Fix any unit test that expected movers UI.

- [ ] **Step 5: Chart — consumption buckets + allocation aside**

In `dashboard/+page.svelte`, before `bucketPeriodHistory`:

```ts
const { consumption, allocation } = partitionLedgerExpenses(
  scopedHistoryTxs,
  saveLinkedIds,
  celeCategoryId
);
// historyBuckets / forwardBuckets from consumption (+ projections filtered the same way if they carry category_id)
```

Pass into `SpendHistoryChart` an optional map or parallel buckets for allocation totals by label. In the selection popup:
- List stack segments (consumption) as today
- `Razem` = `selectedBucket.total` (consumption)
- If allocation total for that label `> 0`, show a separate block titled with new i18n key `dashboard_history_allocation_group` (“Wpłaty na cele”) and amount — **not** added into Razem

- [ ] **Step 6: Plan progress badge**

Replace sparkle+raw count with labeled chip:

```svelte
{m.dashboard_plan_settle_ready({
  count: plan.eligibleCount > 9 ? "9+" : String(plan.eligibleCount),
})}
```

`aria-label` includes full `plan.eligibleCount`. Add pl.json key e.g. `dashboard_plan_settle_ready`: "{count} do powiązania".

- [ ] **Step 7: Paraglide compile + svelte-check + unit**

```bash
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
pnpm exec svelte-check --tsconfig ./tsconfig.json
pnpm exec vitest run tests/unit/spending-insight.spec.ts tests/unit/goal-spending.spec.ts tests/unit/dashboard-spending-insight-card.spec.ts
```

- [ ] **Step 8: Commit**

```bash
git commit -m "$(cat <<'EOF'
fix(dashboard): consumption-only insight chart and calmer Kokpit chrome

Hide clamped savings noise, match Zakres dat to chips, and stop Cele from
driving spend alarms and bar height.
EOF
)"
```

---

### Task 3: Planning queue — remove debt chip (TDD)

**Files:**
- Modify: `src/lib/services/planning-queue.ts`
- Modify: `tests/unit/planning-queue.spec.ts`

- [ ] **Step 1: Rewrite debt tests to expect no debt action**

Change `"debt chip uses active loans only"` and related cases: with active debt plans present, `actions.find(a => a.id.startsWith("debt-"))` is `undefined`. Keep off-track save / no-income tests.

- [ ] **Step 2: Run — expect FAIL** on old assertions / new expectations

- [ ] **Step 3: Delete the `activeDebtPlans` block in `buildPlanningQueueActions` (lines that push `debt-${first.id}`).

- [ ] **Step 4: Run — PASS**

```bash
pnpm exec vitest run tests/unit/planning-queue.spec.ts
```

- [ ] **Step 5: Commit** (can fold into Task 4 commit if preferred)

```bash
git commit -m "$(cat <<'EOF'
fix(plans): drop duplicate debt-rata planning queue chip

The Hipoteka card already shows the monthly payment.
EOF
)"
```

---

### Task 4: SurplusCard → Bilans miesiąca + NetWorthHero cleanup

**Files:**
- Modify: `src/lib/components/plans/SurplusCard.svelte`
- Modify: `src/lib/components/plans/NetWorthHero.svelte`
- Modify: `messages/pl.json` (+ compile)
- Optionally adjust `plans/+page.svelte` if it relied on removed copy paths

- [ ] **Step 1: Update i18n**

Set / add:
- `plans_surplus_title`: `"Bilans tego miesiąca kalendarzowego"`
- `plans_surplus_headline_positive`: `"Bilans miesiąca: +{amount}"`
- `plans_surplus_headline_negative`: `"Bilans miesiąca: −{amount}"`
- Reuse same headlines for hasSaveGoals / free paths (or point both branches at these two).

Remove usages of: `plans_surplus_estimate_note`, `plans_surplus_after_save`, `plans_surplus_saved_this_month`, `plans_surplus_debt_note`, `plans_surplus_no_actions`, old “brakuje na zobowiązania” / “Możesz odłożyć”. Delete unused keys from `pl.json` after grep confirms no references. Keep `glossary_term_nadwyzka` if glossary still references it.

- [ ] **Step 2: Slim SurplusCard**

- Headline amount: `summary.surplus` (cashflow), not `availableForGoals`
- Colors: surplus ≥ 0 emerald, else amber/rose
- Actions list only if `actions.length > 0` — **no** empty filler
- Details: three cells only + transactions link
- Delete estimate / after-save / saved-this-month / debt-note blocks

- [ ] **Step 3: NetWorthHero**

- Remove `net_worth_goal_assets_hint` paragraph
- Keep **either** `plans_net_worth_private_badge` **or** `plans_net_worth_private_hint` (prefer badge + drop the long hint). Keep `plans_net_worth_manual_note` (assets/banks) as the single footer explanation.

- [ ] **Step 4: Compile + check**

```bash
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
pnpm exec svelte-check --tsconfig ./tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
fix(plans): honest month bilans and quieter net-worth copy

Stop framing cashflow deficits as missing obligations and drop redundant hints.
EOF
)"
```

---

### Task 5: Cash strip edit sheet on Transakcje

**Files:**
- Modify: `src/lib/components/transactions/CashPositionStrip.svelte`
- Modify: `src/routes/transactions/+page.svelte`
- Modify: `messages/pl.json` (+ compile)
- Reuse: `upsertPrivateCashPosition`, `fetchPrivateCashPosition` (or whatever the page already uses for `cashAnchorQuery`)

- [ ] **Step 1: Make strip interactive**

- Entire strip is a `<button type="button">` (or button wrapping content) opening local `editOpen` state; also works when `!hasAnchor` (set-hint CTA).
- Footer row: link `<a href="/plans">` with `m.cash_position_net_worth_link()` (“Majątek netto →”) — `onclick` stopPropagation so it doesn’t open the sheet.

- [ ] **Step 2: Sheet fields**

Dialog/Sheet title: cash label. Fields mirror plans net-worth cash fields:
- opening amount (number)
- as-of date (`DayPicker` or native date — match plans form)
- Save calls `upsertPrivateCashPosition`; invalidate cash-position + transactions cash-history queries (same keys plans page uses).

Seed form from `cashAnchorQuery.data` when opening.

- [ ] **Step 3: Optional deep link**

If cheap: `/plans?editNetWorth=1` and plans page `$effect` opens existing net-worth dialog. If not already patterned, ship link to `/plans` only (spec allows).

- [ ] **Step 4: Compile + svelte-check**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(transactions): edit private cash anchor from the gotówka strip

Sheet for opening amount and as-of date; full majątek netto stays on Plany.
EOF
)"
```

---

### Task 6: Goal detail polish

**Files:**
- Modify: `src/lib/components/plans/SavePlanDetail.svelte`
- Modify: `src/routes/plans/[id]/+page.svelte`
- Modify: `messages/pl.json` (+ compile)

- [ ] **Step 1: Hero label**

Replace `{m.plan_kind_save()}` eyebrow next to the big saved amount with `{m.plan_save_saved_label()}` (“Odłożono”) — add key if missing. Keep kind elsewhere if needed (page title / breadcrumb).

- [ ] **Step 2: Single on-track signal**

Keep badge **or** `{m.plan_save_on_track()}` sentence — not both. Prefer badge; drop the duplicate sentence when badge shows.

- [ ] **Step 3: Monthly actual copy**

- Default actual line: include “w tym miesiącu” in `plan_save_monthly_actual` or a new key.
- When `monthlyActualBasis === "historical-average"`, keep/show estimate badge (already present).

- [ ] **Step 4: CTA cleanup**

In `plans/[id]/+page.svelte` for save plans with `onContribute`: remove the dashed `plan_detail_manual_add` button above Wpłaty (contribute + Powiąż remain). Keep manual add on settle route.

- [ ] **Step 5: Wpłaty list**

- One header only: keep the summary row (`3 · 25 000 zł`); pass empty/`null` title into `LinkedSection` or skip its `<h2>` when title omitted.
- Row layout: `min-w-0` on text column; description `truncate`; badge below title on `xs` if needed; amount **without** leading `−` for save contributions (absolute value + emerald). Ensure parent has horizontal padding so cards don’t kiss the viewport edge.

- [ ] **Step 6: Compile + svelte-check**

- [ ] **Step 7: Commit**

```bash
git commit -m "$(cat <<'EOF'
fix(plans): calm save-goal detail CTAs and mobile wpłaty rows

Clarify odłożono vs target, one on-track signal, and stop triple add paths.
EOF
)"
```

---

### Task 7: Verification gates + E2E touch-ups

**Files:**
- Modify E2E only if assertions break: `e2e/tests/plans.spec.ts`, `e2e/tests/dashboard-*.spec.ts`, `e2e/tests/transactions*.spec.ts`, cash-position spec if present
- Update `docs/specs/2026-07-17-trust-simplification-kokpit-plans-design.md` status → Implemented (when done)
- Optional: one-line `CLAUDE.md` immediate-next if this was the active increment

- [ ] **Step 1: Full local gates from `apps/web-svelte/`**

```bash
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
pnpm exec svelte-check --tsconfig ./tsconfig.json
pnpm lint
pnpm format:check
pnpm test:unit
pnpm test:e2e
```

Fix any broken selectors/copy assertions (Nadwyżka → Bilans, removed NA string, etc.).

- [ ] **Step 2: Secret scan on changed files**

```bash
git diff --name-only origin/dev...HEAD | xargs grep -nE "(eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|PRIVATE|password\s*=)" || true
```

- [ ] **Step 3: Suggested commit list for the PR** (already created per task); if squashed differently, keep the three-commit story in the PR body via `./scripts/open-pr.sh`.

---

## Spec coverage checklist

| Spec item | Task |
| --- | --- |
| Chip-sized Zakres dat (dashboard-only) | 2 |
| Hide savings NA / clamped −100% | 2 |
| Consumption insight + header total | 1, 2 |
| Drop SZCZEGÓŁY/movers | 2 |
| Chart exclude Cele; Razem = stack; Cele aside | 2 |
| Settle badge labeled / 9+ | 2 |
| Bilans miesiąca card + prune essay keys | 4 |
| Remove debt queue chip + empty filler | 3, 4 |
| Net worth hint / one privacy line | 4 |
| Cash strip sheet + Majątek link | 5 |
| Goal detail hero/CTA/Wpłaty | 6 |
| Gates / E2E | 7 |
| Residuals (ring vs insight) | documented; no task |

## Execution handoff

Plan saved to `docs/plans/2026-07-17-trust-simplification-kokpit-plans.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
