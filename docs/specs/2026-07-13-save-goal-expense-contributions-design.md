# Save-goal contributions as Cele expenses — design

Date: 2026-07-13 (rev 3 after second design review)
Status: implemented locally on `dev`; awaiting manual commits and deployment
Stream: 1 of 4 (order approved: Plans → onboarding copy → groups audit → cleanup)

## Problem

Save plans settle by linking **income** transactions
(`settlementTypesForPlanKind("save") → ["income"]`,
`apps/web-svelte/src/lib/services/plan-settlement-policy.ts:16`; DB-enforced
`save→income` in `link_plan_transaction`,
`supabase/migrations/20260718000000_remove_spend_plans.sql:64`). This is wrong
three ways:

1. **Semantics** — putting money aside is not income. Users must record a fake
   income row ("Wpłata na cel") to make goal progress.
2. **Phantom cash** — the fake income row raises the derived cash pool with
   money that never arrived, inflating net worth
   (`computeNetWorth` = derived cash + manual assets − debts,
   `apps/web-svelte/src/lib/services/financial-snapshots.ts:25`).
3. **Income stats inflation** — dashboard income totals and savings ratio
   include contribution rows.

The `financial-surplus.ts` doc comment (line 26-28) already describes the
correct model ("the transfer's expense side inside `totalExpenses`") — the
data model never matched it.

## Decision (user-approved)

Flip save-plan settlement from income links to **expense links**. A
contribution = an expense transaction (money leaves the derived cash pool
toward the goal) linked to the save plan; it raises `savedAmount` and lowers
the remaining amount toward `target_amount`.

Approved sub-decisions:

- **Accounting model:** goal balance is an **automatic net-worth asset** —
  each active **private** save plan contributes `savedAmount` as an asset
  line, so a contribution is net-worth neutral (cash ↓, goal asset ↑). UI
  marks the line as automatic so users don't duplicate it as a manual asset.
  **Group save plans are excluded** — derived cash is private-only
  (`group_id === null` filter in both net-worth surfaces), so a group goal
  asset would inflate net worth with no matching cash outflow. (Group DEBT
  plans already distort net worth this way — pre-existing issue, owned by
  the groups-audit stream, not extended here.)
- **Cele category is a UX default, not a DB invariant.** The invariant is
  "save-plan links are expenses". Cele is prefilled/resolved per user by name
  (existing `goal-spending.ts` pattern); categories stay per-user, editable.
- **Contribute UX:** quick action + manual (not auto-link).
- **Legacy data:** convert only synthetic "Wpłata na cel" rows; unlink (do not
  mutate) other linked income.
- **Dashboard:** Cele expenses stay in expense totals + treemap; excluded
  from spending-anomaly detection.
- **Forms:** with plan context known, category (Cele) and type (expense) are
  prefilled and hidden; only relevant fields shown.
- **Linking is bidirectional:** plan→many transactions (settle page, exists)
  and transaction→plan (detail sheet gets the write side; the read side —
  `transaction-plan-link` query showing the linked plan — already exists).

## Design

### 0. Prerequisite: fix cross-member category join (one migration)

`20260801000000_transactions_view_category_left_join.sql` — categories are
owner-read-only (sole surviving policy `categories: users read own`;
group-shared and system read dropped in `20260605`/`20260607`), while
`transactions_with_category` is `security_invoker` with an **inner**
`join categories` (`20260722000000:22`). A group member therefore loses every
shared transaction created by someone else — the row itself, not just the
category label. This silently breaks group transaction lists and per-member
debt-settle balances today, and would break group contributions here.

Fix in the view, once, for all callers:

```sql
left join public.categories c on c.id = t.category_id
-- select list:
coalesce(c.name, 'Inna kategoria') as category_name,
coalesce(c.type, t.type)           as category_type,
```

Categories stay private; other members see the shared row with a fallback
label. TS types unchanged (columns stay non-null). New RLS regression test:
member B sees member A's group transaction through the view.

### 1. Database (one migration)

`20260802000000_save_plans_expense_settlement.sql` (latest applied before
this stream is `20260731000000_notification_redesign.sql`):

1. **Link-time rule** — recreate `link_plan_transaction`: linked transaction
   must be `expense` for BOTH kinds. Kind branches collapse to one check.
   Authorization stays as today: plan owner or member of the plan's group
   (`is_group_member`), matching the "members may settle" contract. Status
   stays flow-enforced (client eligibility = `paid`; quick-settle flows manage
   status transitions) — the RPC does not gate on status, unchanged.
2. **Update-time invariant** — new trigger on `public.transactions`:
   `BEFORE UPDATE OF type`, when the row has any `plan_transaction_links`,
   reject changing `type` away from `expense`
   (`transaction_type_locked_by_plan_link`). Without this, a linked row could
   be edited back to income and silently corrupt progress. (Date/scope edits
   stay allowed — same latitude as today.)
3. **Atomic contribution RPC** — `add_plan_contribution(p_plan_id, p_amount,
   p_date, p_description)` SECURITY DEFINER: validates auth + plan access
   (same policy as `link_plan_transaction`), resolves the **caller's** "Cele"
   expense category (creates it via the per-user seed helper from
   `20260724000000` if missing), inserts a `paid` expense with the plan's
   scope (private/group), links it, returns the transaction id — one DB
   transaction, no client-side compensating delete.
4. **Legacy conversion (scoped, idempotent)** —
   - Links joining a `save` plan to an income transaction whose category name
     is "Wpłata na cel": convert the transaction to `type='expense'`,
     `category_id` → that owner's "Cele" expense category (seed if missing).
     Links stay; `savedAmount` totals survive.
   - Links joining a `save` plan to any **other** income transaction (real
     salary/bonus — ranking encouraged these,
     `plan-settlement.ts:311`): **delete the link, leave the transaction
     untouched**. Progress for those plans drops honestly rather than
     rewriting real income as spending.
   - Second run finds no save→income links → no-op.
5. **"Wpłata na cel" retirement** — removed from the default per-user category
   seed; existing per-user copies deleted **only** when unreferenced by ALL
   referencing tables — `transactions`, `categorization_rules`
   (`ON DELETE CASCADE`, `20260520000000:254`), `plans.category_id`
   (`ON DELETE SET NULL`, `20260617000000:12`) — otherwise kept.

Demo seed (`seed-personas` / `demo-data.ts`): contributions become Cele
expenses linked to save plans.

### 2. Net worth (new goal-asset line)

- `computeNetWorth` gains `goalAssets: number`: Σ `savedAmount` of **active
  private** save plans (`isLivePlan` AND `group_id === null`), added to
  `totalAssets`.
- Wire on `/plans` (`+page.svelte` already holds `progressQuery` with
  per-plan progress) and the Pulpit net-worth strip.
- UI: goal line labeled as automatic ("z celów oszczędnościowych") with a hint
  not to duplicate it as a manual asset item.
- **Plan end:** when a save plan leaves `isLivePlan` (end date passed or
  closed), its goal asset drops out — correct when the money was spent on the
  goal's purpose. If the user keeps the cash saved, they record it as a manual
  net-worth item; plan detail's completed state gets a one-line hint saying
  exactly that. No automatic conversion.

### 3. Services (source flips; formula shapes unchanged)

- `plan-settlement-policy.ts` — settlement type is `expense` for both kinds;
  delete `settlementTypesForPlanKind`/`resolveSettlementTypes` kind-branching
  if nothing else needs it (flat expense check in
  `isTransactionEligibleForPlanSettlement`).
- `plan-settlement.ts` —
  - `savedAmount` = Σ linked **expenses** on save plans (today filters
    `income` at ~lines 359/411/420); for save plans `spentAmount` and
    `savedAmount` collapse to one number where sensible.
  - `sumLinkedIncomeInMonth` → reads linked expenses;
    `PlanSettlementProgress.linkedIncomeCurrentMonth` renamed
    `saveContributionsCurrentMonth` (callers: surplus wiring, planning queue).
  - `computeSaveMonthlyActual` / `Detail`: same flip.
  - Suggestion ranking: eligible pool is expenses; the income-amount bonus
    (`plan-settlement.ts:311`) becomes an expense-amount bonus with a
    Cele-category boost; `<45%` cutoff + dismissal memory unchanged.
- `financial-surplus.ts` — no formula change; doc comment updated
  (`saveContributionsThisMonth` = current-month linked expenses).
- `goal-spending.ts` — `goalLinkedIncome` dies; Cele expenses split **linked**
  (contributions) vs **unlinked**; `hasGoalActivity` derives from those.
- Spending-anomaly cards: skip the caller's resolved Cele category
  (name-resolution heuristic, consistent with `goal-spending.ts`).
- `plan-save-pace.ts`, net-worth strip math — no change beyond upstream flip.

### 4. Contribution UX — "Dodaj wpłatę"

- `SavePlanDetail` (and save `PlanCard` quick action) gets **Dodaj wpłatę**:
  minimal sheet — suggested amount, date (default local today), optional
  description behind secondary edit. Type/category not rendered. Calls
  `add_plan_contribution` RPC.
- Suggested amount precedence: explicit workflow amount → remaining current-month
  pace → most recent confirmed contribution to this same plan, always capped at
  the goal remainder. If none is valid, amount stays empty and receives focus.
  Never reuse an amount from another plan.
- Plan scope is locked by context and shown as a compact private/group label.
  The user normally verifies the suggested amount and submits; changing advanced
  transaction details remains reachable but is not the default path.
- `TransactionDialog` opened with a save plan preselected: prefill + hide type
  and category, rest of the form normal.
- Invalidation after contribute/link/unlink (matches settle page today,
  `settle/+page.svelte:140`): `plan-links`, `plan-ranked`, `plan-eligible`,
  `plan-progress-list`, `plan-progress`, `plans`, plus `transactions`,
  `summary`, and `transaction-plan-link` (detail-sheet state).

### 5. Transaction → plan linking (write side)

- `TransactionDetailSheet` gains **Połącz z planem** for eligible rows:
  `type === "expense"`, status `paid`, not already linked
  (`transaction-plan-link` query, already present at line ~90). Gate matches
  the settle policy (plan owner or group member) — NOT the narrower
  `canManageTransaction`; the RPC is the single authority, client mirrors it.
- Picker lists active plans (`status='active'`, date window contains tx date,
  scope match: private tx → private plans, group tx → that group's plans).
  Linking a debt plan runs the existing `syncDebtBalanceAfterLinkChange` path.
- Linked rows show plan name (exists) + **Odłącz od planu**.

### 6. Copy (PL, minimal for this stream)

New keys: "Dodaj wpłatę", sheet labels, "Połącz z planem", "Odłącz od planu",
net-worth goal line + no-duplicate hint. Settle-page suggestion/empty copy
flips income→wpłata wording. Glossary entries mentioning income-based goals
get a minimal correctness fix; the full copy rewrite is stream 3.

### 7. Testing

- **Unit:** eligibility rejects income for save; `savedAmount` from expenses;
  contribution-month sum; surplus wiring; ranking Cele boost; goal-spending
  linked/unlinked split; anomaly Cele exclusion; `computeNetWorth` with goal
  balances (neutrality: contribution moves cash→goal, total unchanged).
- **RLS/DB:** `link_plan_transaction` rejects income for save; type-lock
  trigger rejects expense→income on a linked row and allows it after unlink;
  `add_plan_contribution` creates+links atomically, seeds Cele when missing,
  respects scope + member policy; legacy conversion converts only
  "Wpłata na cel" rows, unlinks other income, idempotent; category retirement
  keeps referenced copies.
- **E2E (one journey, lean policy):** create save goal → Dodaj wpłatę →
  progress + cash strip + net worth reflect → link an existing Cele expense
  from the detail sheet → progress updates → unlink restores.
- Existing `plan-settle` E2E + demo fixtures updated to expense contributions.

## Implementation note (2026-07-14)

Implemented in migration `20260802000000_save_plans_expense_settlement.sql`
and the plan/transaction/net-worth surfaces described above. The quick form
uses explicit amount → unmet monthly pace → same-plan history, caps at the
remaining target, defaults to the local date, and never carries scope or amount
between plans. Transaction detail supports eligible plan link/unlink with debt
balance synchronization. Demo goal contributions are Cele expenses linked to
the demo save plan.

## Out of scope

- Streams 2–4 (groups audit, onboarding/glossary copy rewrite, redundancy
  cleanup) — separate specs.
- Auto-linking Cele expenses to plans (rejected in brainstorm).
- Debt-plan behavior changes (already expense-based).
- A stable semantic category key (`system_key`) — Cele stays a name-resolved
  UX default; revisit only if rename/delete confusion shows up in practice.
- Locking linked-transaction date/scope/status edits (only `type` is locked;
  unpaid links are inert — `computePlanProgress` counts `paid` rows only).
  Plan-kind edits are harmless to links post-flip (both kinds link expenses).
- `TransactionDialog` plan-context create-then-link (pre-existing two-step;
  a failed link leaves an ordinary unlinked transaction, recoverable via
  settle suggestions). Quick-add uses the atomic RPC.
- Group net-worth semantics (group debts subtracted from private net worth
  with no group cash) — pre-existing; owned by the groups-audit stream.

## Acceptance criteria

0. A group member sees other members' shared transactions through
   `transactions_with_category` (fallback category label), RLS-tested; group
   plan progress agrees across members.
1. A save-plan contribution is an expense linked to the plan; recording one
   lowers derived cash, raises `savedAmount`, lowers remaining toward
   `target_amount`, and (for private plans) leaves net worth unchanged via
   the goal-asset line. Group save plans never enter net worth.
2. DB rejects income links to save plans at link time AND rejects editing a
   linked transaction's type away from expense.
3. Quick-add is atomic (single RPC); no orphan transaction on any failure.
4. Legacy conversion: "Wpłata na cel" rows converted in place (progress
   preserved); other linked income unlinked untouched; migration idempotent.
5. Dodaj wpłatę = amount + date + optional note only.
6. A paid, unlinked expense can be linked to an eligible plan from its detail
   sheet and unlinked again, honoring the settle-policy gate.
7. Dashboard: Cele in totals/treemap, never in anomaly cards; income totals
   contain no contribution rows post-migration.
8. Gates: svelte-check 0/0, lint 0, format clean, unit green, RLS green,
   focused plans/transactions E2E green, `supabase db reset` clean, secret
   scan clean.
