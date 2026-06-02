# Bank Import UX v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the bank-import review into a single default-import surface with folded duplicates, optional rules, short header labels, conditional commit confirm, and corrected copy (issue #73).

**Architecture:** One review surface replaces the nested `duplicates → categorize → finalize` sub-steps. Rows default to `decision='import'` at insert; probable duplicates are flipped to `decision='duplicate'` once at upload by a new SECURITY DEFINER RPC `mark_preview_duplicates`, surfaced as a collapsible banner. The client epoch/auto-mark machinery is deleted. Commit uses the unchanged `commit_import_session` RPC, gated by a conditional confirm sheet.

**Tech Stack:** SvelteKit (adapter-static, Svelte 5 runes), TanStack Query v6, Supabase (PostgREST + SECURITY DEFINER RPCs), Paraglide v2 i18n, Vitest + Playwright.

---

## File Structure

**Create:**
- `supabase/migrations/20260609000000_mark_preview_duplicates.sql` — new RPC: scan + flip `import→duplicate` + return warnings.
- `apps/web-svelte/src/lib/components/import/DuplicateBanner.svelte` — collapsible auto-skipped-duplicates banner (replaces `ImportReviewDuplicatesStep`).
- `apps/web-svelte/src/lib/components/import/ImportConfirmSheet.svelte` — conditional commit confirm dialog (replaces `ImportReviewFinalizeStep`).
- `apps/web-svelte/tests/rls/mark_preview_duplicates.spec.ts` — RLS/behavior test for the new RPC.

**Modify:**
- `apps/web-svelte/src/lib/services/bank-import.ts` — `insertPreviewRows` default `import`; add `markPreviewDuplicates`.
- `apps/web-svelte/src/lib/components/import/FileUpload.svelte:113` — call `markPreviewDuplicates` after insert.
- `apps/web-svelte/src/lib/components/import/ImportReviewFlow.svelte` — slim orchestrator: drop sub-steps + epoch machinery; default-import logic; conditional confirm; bug fixes #1/#3/#4.
- `apps/web-svelte/src/lib/components/import/ImportReviewCategorizeStep.svelte` — becomes the single surface body: skip toggle, declutter, unified bulk scope.
- `apps/web-svelte/src/lib/components/transactions/TransactionDataActions.svelte` — short "Import"/"Eksport" controls all breakpoints; drop sheet.
- `apps/web-svelte/messages/pl.json` — copy fixes + new keys; recompile Paraglide.
- `apps/web-svelte/e2e/tests/bank-import.spec.ts` — rewrite per regression matrix.

**Delete:**
- `apps/web-svelte/src/lib/components/import/ImportReviewDuplicatesStep.svelte`
- `apps/web-svelte/src/lib/components/import/ImportReviewFinalizeStep.svelte`

**Gate commands (run from `apps/web-svelte/`):**
- `pnpm exec svelte-check --tsconfig ./tsconfig.json` → 0 errors, 0 warnings
- `pnpm lint` → 0 errors
- `pnpm format:check`
- `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`

---

## Increment 1 — Backend: `mark_preview_duplicates` RPC + service

### Task 1: New RPC migration

**Files:**
- Create: `supabase/migrations/20260609000000_mark_preview_duplicates.sql`

- [ ] **Step 1: Write the migration**

The function mirrors `preview_fingerprint_warnings` (migration `20260602000001`) exactly for the 3 scan paths, but additionally flips matched rows whose `decision='import'` to `'duplicate'` and sets `duplicate_of`. It returns the same 6-field warning array so the banner can render detail. Only `import` rows are touched — never `skip` or an existing `duplicate` (idempotent, override-safe).

```sql
-- Bank import v2 (issue #73): default-import + folded duplicates.
--
-- mark_preview_duplicates runs the same probable-duplicate scan as
-- preview_fingerprint_warnings, but ALSO sets decision='duplicate' (and
-- duplicate_of) on matched rows that are still decision='import'. Called once
-- right after insertPreviewRows so the review surface opens with duplicates
-- pre-skipped. Read-only preview_fingerprint_warnings stays for resume/refresh
-- banner detail (never re-mutates, so a user's "import anyway" is preserved).
--
-- Scan paths + fingerprint formula MUST match commit_import_session and
-- preview_fingerprint_warnings exactly. Only rows with decision='import' are
-- flipped: skip / already-duplicate rows are untouched (idempotent).

create or replace function mark_preview_duplicates(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_session  transaction_import_sessions;
  v_warnings jsonb := '[]'::jsonb;
  v_row      transaction_import_rows;
  v_fp       text;
  v_dup_of    uuid;
  v_dup_date  date;
  v_dup_amt   numeric(12,2);
  v_dup_cur   text;
  v_dup_desc  text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_session
    from transaction_import_sessions
   where id = p_session_id
     and user_id = v_uid;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  for v_row in
    select *
      from transaction_import_rows
     where session_id = p_session_id
     order by row_index
  loop
    v_fp := encode(
      extensions.digest(
        v_row.amount::text
        || '|' || v_row.currency
        || '|' || coalesce(v_row.description, '')
        || '|' || coalesce(v_row.counterparty, ''),
        'sha256'
      ),
      'hex'
    );

    v_dup_of := null;
    v_dup_date := null; v_dup_amt := null; v_dup_cur := null; v_dup_desc := null;

    -- Path A: prior imported-link fingerprint match (±3 days)
    select t.id, t.date::date, t.amount, t.currency, t.description
      into v_dup_of, v_dup_date, v_dup_amt, v_dup_cur, v_dup_desc
      from transaction_import_links l
      join transactions t on t.id = l.transaction_id
     where l.user_id = v_uid
       and l.fingerprint = v_fp
       and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
     order by t.date
     limit 1;

    -- Path B: shopping-list-created expense match (±3 days)
    if v_dup_of is null and v_row.type = 'expense' then
      select t.id, t.date::date, t.amount, t.currency, t.description
        into v_dup_of, v_dup_date, v_dup_amt, v_dup_cur, v_dup_desc
        from transactions t
       where t.type = 'expense'
         and t.shopping_list_id is not null
         and t.amount = v_row.amount
         and t.currency = v_row.currency
         and t.date::date between (v_row.posted_at - 3) and (v_row.posted_at + 3)
         and (t.user_id = v_uid or (t.group_id is not null and is_group_member(t.group_id)))
       order by t.date
       limit 1;
    end if;

    -- Path C: manual / non-list transaction match (±1 day)
    if v_dup_of is null then
      select t.id, t.date::date, t.amount, t.currency, t.description
        into v_dup_of, v_dup_date, v_dup_amt, v_dup_cur, v_dup_desc
        from transactions t
        left join transaction_import_links l on l.transaction_id = t.id
       where t.type = v_row.type
         and t.shopping_list_id is null
         and l.transaction_id is null
         and t.amount = v_row.amount
         and t.currency = v_row.currency
         and t.date::date between (v_row.posted_at - 1) and (v_row.posted_at + 1)
         and (t.user_id = v_uid or (t.group_id is not null and is_group_member(t.group_id)))
       order by t.date
       limit 1;
    end if;

    if v_dup_of is not null then
      if v_row.decision = 'import' then
        update transaction_import_rows
           set decision = 'duplicate', duplicate_of = v_dup_of
         where id = v_row.id;
      end if;
      v_warnings := v_warnings || jsonb_build_object(
        'row_id',                      v_row.id,
        'duplicate_of_transaction_id', v_dup_of,
        'duplicate_of_date',           v_dup_date,
        'duplicate_of_amount',         v_dup_amt,
        'duplicate_of_currency',       v_dup_cur,
        'duplicate_of_description',    v_dup_desc
      );
    end if;
  end loop;

  return v_warnings;
end;
$$;

revoke all on function mark_preview_duplicates(uuid) from public;
grant execute on function mark_preview_duplicates(uuid) to authenticated;

comment on function mark_preview_duplicates(uuid) is
  'Bank import v2: flips probable-duplicate rows (decision=import) to duplicate '
  'and returns the same warning shape as preview_fingerprint_warnings. Run once '
  'after insertPreviewRows. Idempotent: only import rows are flipped.';
```

- [ ] **Step 2: Apply locally and verify clean reset**

Run from repo root: `supabase db reset`
Expected: applies through `20260609000000_mark_preview_duplicates.sql` with no error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260609000000_mark_preview_duplicates.sql
git commit -m "feat(import): add mark_preview_duplicates RPC for default-skip dups (#73)"
```

### Task 2: RLS/behavior test for the new RPC

**Files:**
- Create: `apps/web-svelte/tests/rls/mark_preview_duplicates.spec.ts`
- Reference style: `apps/web-svelte/tests/rls/commit_import_session.spec.ts`, `apps/web-svelte/tests/rls/bank-import-list-warnings.spec.ts`

- [ ] **Step 1: Write the test (mirror the existing RLS harness)**

Read `tests/rls/commit_import_session.spec.ts` first to reuse its session/row seeding helpers and service-role client setup. Assert:
1. A row matching an existing manual transaction (same amount/currency, ±1 day, no link) is flipped to `decision='duplicate'` with `duplicate_of` set, and appears in the returned warnings.
2. A non-matching row stays `decision='import'`.
3. A row the caller pre-set to `decision='skip'` is **not** flipped (idempotency/override-safety).
4. Calling as a different user on someone else's session raises `session_not_found`.

```ts
// Skeleton — adapt helpers/imports to match commit_import_session.spec.ts.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
// import { serviceClient, makeUserClient, seedSession, seedRow, seedManualTx } from "./_helpers";

describe("mark_preview_duplicates", () => {
  it("flips a matching import row to duplicate and returns the warning", async () => {
    // seed: user A manual expense 45.20 PLN on 2026-05-02
    // seed: preview session for user A + import row 45.20 PLN 2026-05-02 decision=import
    // const warnings = await userA.rpc("mark_preview_duplicates", { p_session_id });
    // expect(warnings).toHaveLength(1);
    // expect(row.decision).toBe("duplicate");
    // expect(row.duplicate_of).toBe(manualTxId);
  });

  it("leaves a non-matching row as import", async () => {
    // row amount 999.99 with no match → decision stays "import", warnings empty for it
  });

  it("does not flip a row the user marked skip", async () => {
    // pre-set decision=skip on a matching row → stays "skip" after the call
  });

  it("raises session_not_found for another user's session", async () => {
    // userB.rpc on userA session → error code P0002
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm test -- mark_preview_duplicates` (from `apps/web-svelte/`)
Expected: PASS (requires local Supabase up + `.env.test` keys).

- [ ] **Step 3: Commit**

```bash
git add apps/web-svelte/tests/rls/mark_preview_duplicates.spec.ts
git commit -m "test(import): RLS coverage for mark_preview_duplicates (#73)"
```

### Task 3: Service — default-import insert + `markPreviewDuplicates`

**Files:**
- Modify: `apps/web-svelte/src/lib/services/bank-import.ts:290` and add new fn near `previewFingerprintWarnings` (`:175`)

- [ ] **Step 1: Change the insert default from pending to import**

In `insertPreviewRows`, replace the decision line (`bank-import.ts:290`):

```ts
      decision: "pending" as const,
```

with:

```ts
      decision: "import" as const,
```

Also update the JSDoc above `insertPreviewRows` (`:253-267`): replace the sentence "Decision stays 'pending' - the user still confirms in review." with "Decision defaults to 'import' (default-import model, issue #73); probable duplicates are flipped to 'duplicate' by markPreviewDuplicates right after this call."

- [ ] **Step 2: Add the service wrapper**

Insert after `previewFingerprintWarnings` (after `bank-import.ts:181`):

```ts
/**
 * Mutating probable-duplicate pass (issue #73). Flips matching rows from
 * decision 'import' to 'duplicate' server-side and returns the same warning
 * shape as previewFingerprintWarnings. Call ONCE right after insertPreviewRows
 * at upload. On resume/refresh use previewFingerprintWarnings (read-only) for
 * banner detail instead, so a user's "import anyway" override is preserved.
 */
export async function markPreviewDuplicates(sessionId: string): Promise<DuplicateWarning[]> {
  const { data, error } = await supabase.rpc("mark_preview_duplicates", {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return data as unknown as DuplicateWarning[];
}
```

Note: `supabase.rpc("mark_preview_duplicates", …)` is untyped against generated `supabase.types.ts`; the `as unknown as` cast matches the existing `commitImportSession`/`previewFingerprintWarnings` pattern, so no type regen is required.

- [ ] **Step 3: Verify types**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors (the RPC name string is not type-checked; cast handles the return).

- [ ] **Step 4: Commit**

```bash
git add apps/web-svelte/src/lib/services/bank-import.ts
git commit -m "feat(import): default rows to import + markPreviewDuplicates service (#73)"
```

### Task 4: FileUpload — run the dup scan after insert

**Files:**
- Modify: `apps/web-svelte/src/lib/components/import/FileUpload.svelte:14-16` (import) and `:113-114` (call site)

- [ ] **Step 1: Import the new service fn**

Add `markPreviewDuplicates,` to the existing `$lib/services/bank-import` import block (alongside `insertPreviewRows`, `:15`).

- [ ] **Step 2: Call it once, after insert, before handing off**

Replace `FileUpload.svelte:113-114`:

```ts
      await insertPreviewRows(session.id, normalized.rows, resolver);
      onSessionReady(session, parseErrorCount);
```

with:

```ts
      await insertPreviewRows(session.id, normalized.rows, resolver);
      // Default-skip probable duplicates once (issue #73). Best-effort: a failure
      // here must not block the import — the review surface still opens, and the
      // commit RPC re-detects duplicates as a safety net.
      try {
        await markPreviewDuplicates(session.id);
      } catch {
        /* non-fatal: dups will still be caught at commit */
      }
      onSessionReady(session, parseErrorCount);
```

- [ ] **Step 3: Verify**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web-svelte/src/lib/components/import/FileUpload.svelte
git commit -m "feat(import): flip probable duplicates at upload time (#73)"
```

---

## Increment 2 — Copy / messages

### Task 5: pl.json edits + Paraglide recompile

**Files:**
- Modify: `apps/web-svelte/messages/pl.json`
- Recompile output: `apps/web-svelte/src/lib/paraglide/`

- [ ] **Step 1: Fix the "księga" copy (issue point 6)**

Line 362 — replace:
```json
  "bank_review_dup_summary_hint": "Te pozycje nie trafią do księgi, dopóki nie wybierzesz „Importuj mimo to”.",
```
with:
```json
  "bank_review_dup_summary_hint": "Te pozycje nie trafią do transakcji, dopóki nie wybierzesz „Importuj mimo to”.",
```

Line 422 — replace:
```json
  "bank_confirm_duplicates_excluded": "Pominięte jako duplikat (nie trafią do księgi): {count}",
```
with:
```json
  "bank_confirm_duplicates_excluded": "Pominięte jako duplikat (nie trafią do transakcji): {count}",
```

- [ ] **Step 2: Add new keys (insert after `bank_review_account_destination`, line 551)**

```json
  "bank_review_dup_banner_summary": "{count} pominięto jako duplikat",
  "bank_review_dup_show": "Pokaż",
  "bank_review_dup_hide": "Ukryj",
  "bank_review_restore_visible_action": "Przywróć widoczne ({count})",
  "bank_review_row_skip": "Pomiń",
  "bank_review_row_restore": "Przywróć",
  "bank_review_footer_counts": "{imp} import · {skip} pominięto · {inne} do „Inne”",
  "bank_review_commit_action": "Zaimportuj {count} transakcji",
  "bank_review_commit_zero_hint": "Brak pozycji do importu - przywróć duplikat lub odznacz pominięcie.",
  "bank_confirm_inne_heading": "Trafią do „Inne” ({count})",
```

(JSON: add a comma to the previous last key in the object if needed — `bank_review_account_destination` is followed by other keys, so insert mid-object with trailing commas.)

- [ ] **Step 3: Recompile Paraglide**

Run: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`
Expected: regenerates `src/lib/paraglide/messages/*`; new keys become importable as `m.bank_review_dup_banner_summary` etc.

- [ ] **Step 4: Commit**

```bash
git add apps/web-svelte/messages/pl.json apps/web-svelte/src/lib/paraglide
git commit -m "feat(import): copy fixes (księga→transakcji) + v2 surface message keys (#73)"
```

> Keys now unused after the rewrite (`bank_review_ready_action`, `bank_review_mark_visible_skipped`, `bank_review_pending_warning`, `bank_review_decision_pending_cue`, `bank_review_filter_pending`, `bank_review_rules_explainer_*`, `bank_import_review_step_*`) are left defined but dereferenced. Removing them is optional cleanup (do NOT remove in this increment — avoids breaking the still-present components mid-rewrite).

---

## Increment 3 — Components: header, banner, confirm sheet, surface, orchestrator

### Task 6: Header — short "Import"/"Eksport" controls (issue point 1)

**Files:**
- Modify: `apps/web-svelte/src/lib/components/transactions/TransactionDataActions.svelte` (full rewrite, 67 → ~40 lines)

- [ ] **Step 1: Replace the whole component**

The mobile `Sheet` and `variant` branching go away; both breakpoints render two pill buttons. Keep `exportDisabled`/`onexport` props; `variant` becomes optional and only tweaks sizing.

```svelte
<script lang="ts">
  import { Download, Landmark } from "lucide-svelte";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    exportDisabled: boolean;
    onexport: () => void;
    variant?: "desktop" | "mobile";
  }

  let { exportDisabled, onexport, variant = "desktop" }: Props = $props();

  const pill =
    "focus-visible:ring-accent flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 px-3.5 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";
  const iconSize = $derived(variant === "mobile" ? 14 : 15);
</script>

<div class="flex shrink-0 items-center gap-2">
  <a href="/transactions/import" class={pill}>
    <Landmark size={iconSize} strokeWidth={1.8} aria-hidden="true" />
    {m.bank_import_short()}
  </a>
  <button type="button" class={pill} disabled={exportDisabled} onclick={onexport}>
    <Download size={iconSize} strokeWidth={1.8} aria-hidden="true" />
    {m.csv_export()}
  </button>
</div>
```

- [ ] **Step 2: Add the `bank_import_short` message key**

In `messages/pl.json`, after `bank_import_entry` (line 323) add:
```json
  "bank_import_short": "Import",
```
Recompile: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`

- [ ] **Step 3: Check callers**

Run: `grep -rn "TransactionDataActions" apps/web-svelte/src`
Expected: confirm both `variant="desktop"` and `variant="mobile"` call sites still type-check (the prop is still accepted). If a caller wrapped the mobile variant in extra `md:hidden` layout, the new component renders inline in both — verify the transactions header still looks right after Step 4 visual check.

- [ ] **Step 4: Verify + format + visual**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json` → 0/0; `pnpm format`.
Visual: load `/transactions` desktop + narrow; both "Import" and "Eksport" pills visible, no sheet.

- [ ] **Step 5: Commit**

```bash
git add apps/web-svelte/src/lib/components/transactions/TransactionDataActions.svelte apps/web-svelte/messages/pl.json apps/web-svelte/src/lib/paraglide
git commit -m "feat(transactions): short Import/Eksport header controls, drop mobile sheet (#73)"
```

### Task 7: `DuplicateBanner.svelte`

**Files:**
- Create: `apps/web-svelte/src/lib/components/import/DuplicateBanner.svelte`

- [ ] **Step 1: Write the component**

Collapsed by default; shows count. Expands to per-row list with "Importuj mimo to" + a top-level "Przywróć wszystkie". Props mirror the data the orchestrator already derives.

```svelte
<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import Button from "$lib/components/ui/Button.svelte";
  import type { ImportRow, DuplicateWarning } from "$lib/services/bank-import";
  import { cn, formatCurrency } from "$lib/utils";

  interface Props {
    duplicateRows: ImportRow[];
    duplicateDetail: (rowId: string) => string | null;
    onImportAnyway: (row: ImportRow) => void;
    onRestoreAll: () => void;
    warningsByRow: Map<string, DuplicateWarning>;
  }
  let { duplicateRows, duplicateDetail, onImportAnyway, onRestoreAll }: Props = $props();

  let expanded = $state(false);
  const count = $derived(duplicateRows.length);
</script>

{#if count > 0}
  <div class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm font-medium text-amber-100">
        {m.bank_review_dup_banner_summary({ count })}
      </p>
      <div class="flex items-center gap-2">
        <Button variant="ghost" size="sm" onclick={onRestoreAll}>
          {m.bank_review_dup_restore_all()}
        </Button>
        <Button variant="ghost" size="sm" onclick={() => (expanded = !expanded)}>
          {expanded ? m.bank_review_dup_hide() : m.bank_review_dup_show()}
        </Button>
      </div>
    </div>

    {#if expanded}
      <ul class="mt-3 space-y-2">
        {#each duplicateRows as row (row.id)}
          <li class="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-slate-100">
                  {row.counterparty ?? row.edited_description ?? row.description}
                </p>
                <p class="mt-0.5 text-xs text-slate-500">{row.posted_at}</p>
                {#if duplicateDetail(row.id)}
                  <p class="mt-1 text-xs text-amber-200/80">{duplicateDetail(row.id)}</p>
                {/if}
              </div>
              <div class="flex shrink-0 flex-col items-end gap-2">
                <span
                  class={cn(
                    "text-sm font-semibold tabular-nums",
                    row.type === "income" ? "text-emerald-300" : "text-rose-300"
                  )}
                >
                  {row.type === "income" ? "+" : "−"}{formatCurrency(row.amount, row.currency)}
                </span>
                <Button variant="ghost" size="sm" onclick={() => onImportAnyway(row)}>
                  {m.bank_review_dup_import_anyway()}
                </Button>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
```

- [ ] **Step 2: Verify**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json` → 0/0 (wired up in Task 10).

- [ ] **Step 3: Commit**

```bash
git add apps/web-svelte/src/lib/components/import/DuplicateBanner.svelte
git commit -m "feat(import): collapsible duplicate banner component (#73)"
```

### Task 8: `ImportConfirmSheet.svelte`

**Files:**
- Create: `apps/web-svelte/src/lib/components/import/ImportConfirmSheet.svelte`
- Reference: `apps/web-svelte/src/lib/components/ui/Dialog.svelte` usage in `routes/transactions/import/+page.svelte:244`

- [ ] **Step 1: Write the component**

A `Dialog` listing the Inne-bound rows and the auto-skipped duplicate count, with Back/Commit. Opened conditionally by the orchestrator (Task 10).

```svelte
<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import type { ImportRow } from "$lib/services/bank-import";
  import { cn, formatCurrency } from "$lib/utils";

  interface Props {
    open: boolean;
    importCount: number;
    skipCount: number;
    dupCount: number;
    inneRows: ImportRow[];
    commitPending: boolean;
    onClose: () => void;
    onCommit: () => void;
  }
  let {
    open,
    importCount,
    skipCount,
    dupCount,
    inneRows,
    commitPending,
    onClose,
    onCommit,
  }: Props = $props();
</script>

<Dialog {open} onclose={onClose} title={m.bank_confirm_title()}>
  <div class="space-y-4">
    <p class="text-sm text-slate-300">
      {m.bank_confirm_summary({ add: importCount, skip: skipCount })}
    </p>

    {#if inneRows.length > 0}
      <div class="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2">
        <p class="text-xs font-medium text-sky-200">
          {m.bank_confirm_inne_heading({ count: inneRows.length })}
        </p>
        <ul class="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {#each inneRows as row (row.id)}
            <li class="flex justify-between gap-3 text-xs text-sky-100/90">
              <span class="min-w-0 truncate">
                {row.counterparty ?? row.edited_description ?? row.description}
              </span>
              <span
                class={cn(
                  "shrink-0 tabular-nums",
                  row.type === "income" ? "text-emerald-300" : "text-rose-300"
                )}
              >
                {row.type === "income" ? "+" : "−"}{formatCurrency(row.amount, row.currency)}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if dupCount > 0}
      <p class="rounded-xl border border-slate-500/40 bg-slate-800/40 px-3 py-2 text-xs text-slate-300">
        {m.bank_confirm_duplicates_excluded({ count: dupCount })}
      </p>
    {/if}

    <div class="flex justify-end gap-2">
      <Button variant="ghost" onclick={onClose} disabled={commitPending}>
        {m.bank_confirm_back()}
      </Button>
      <Button variant="primary" loading={commitPending} disabled={commitPending} onclick={onCommit}>
        {m.bank_confirm_submit({ count: importCount })}
      </Button>
    </div>
  </div>
</Dialog>
```

- [ ] **Step 2: Verify + commit**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json` → 0/0.
```bash
git add apps/web-svelte/src/lib/components/import/ImportConfirmSheet.svelte
git commit -m "feat(import): conditional commit confirm sheet (#73)"
```

### Task 9: Rebuild the review surface body (`ImportReviewCategorizeStep.svelte`)

**Files:**
- Modify: `apps/web-svelte/src/lib/components/import/ImportReviewCategorizeStep.svelte` (declutter + skip toggle + unified bulk)

This task keeps the table/cards/group-sheet markup (verbatim lines 200–413 stay) but: (a) removes the rules-explainer box, (b) removes the `pending`-based bulk button and pending cue, (c) replaces the per-row `decisionControl` snippet content with a single skip toggle, (d) renders `DuplicateBanner` is done by the parent — not here.

- [ ] **Step 1: Trim the props interface**

Remove these props (no longer passed): `pendingCount`, `bulkImportableCount`, `onBulkImport`, `canProceed`, `onNext`, `onBack` (the surface no longer has step nav — commit lives in the parent footer). Keep `bulkSkippableVisibleCount`, add `bulkRestorableVisibleCount: number` and `onBulkRestoreVisible: () => void`. Update both the `interface Props` block (lines 24–58) and the destructuring (lines 60–88) accordingly.

`FilterKind` (line 15) changes from `"pending" | "all" | "income" | "expense"` to `"all" | "uncategorized" | "income" | "expense"` — see Step 4.

- [ ] **Step 2: Delete the rules-explainer box**

Remove lines 117–120 (the `<div … bank_review_rules_explainer_title …>` block). The suggestion-chips block (122–151) stays but compacts: change its outer wrapper `<div class="space-y-1.5">` to a collapsible — wrap the chip row in `{#if showSuggestions}` driven by a local `let showSuggestions = $state(true)` with a small toggle. (Minimal: keep always-visible if collapsibility adds risk; the declutter win is mainly removing the explainer box + pending cue.)

- [ ] **Step 3: Replace the bulk-action toolbar**

Replace the bulk button block (lines 154–169, the `{#if bulkImportableCount}` + `{#if bulkSkippableVisibleCount}` group and the `pendingCount` warning above it, lines 153–169) with:

```svelte
    <div class="flex flex-wrap items-center gap-2">
      {#if bulkSkippableVisibleCount > 0}
        <Button variant="ghost" size="sm" onclick={onBulkSkipVisible}>
          {m.bank_review_skip_visible_action({ count: bulkSkippableVisibleCount })}
        </Button>
      {/if}
      {#if bulkRestorableVisibleCount > 0}
        <Button variant="ghost" size="sm" onclick={onBulkRestoreVisible}>
          {m.bank_review_restore_visible_action({ count: bulkRestorableVisibleCount })}
        </Button>
      {/if}
    </div>
```

- [ ] **Step 4: Update filter pills source**

Filters now come from the parent via `filterOptions`/`filterCounts` (unchanged prop wiring), but the parent (Task 10) supplies `all / uncategorized / income / expense`. No markup change here beyond the `FilterKind` type in Step 1.

- [ ] **Step 5: Replace the per-row decision control (desktop + mobile)**

The parent still passes a `decisionControl` snippet. Its content becomes a single skip toggle (defined in Task 10). Here, remove the two `{#if row.decision === "pending"}` pending-cue blocks: desktop lines 287–291 and mobile lines 364–366 — delete both `{#if …pending}` spans. The `{@render decisionControl(row)}` calls stay.

- [ ] **Step 6: Remove the footer step-nav**

Delete the sticky footer block (lines 380–390, the `Anuluj sesję / Wstecz / Dalej` bar). The commit footer now lives in the parent orchestrator (Task 10). Keep the group `<Sheet>` at the end.

- [ ] **Step 7: Verify**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json`
Expected: errors only where the parent still passes removed props — fixed in Task 10. If validating this task standalone, temporarily comment the parent usage; otherwise do Task 10 in the same commit.

- [ ] **Step 8: Commit (with Task 10 — they are interdependent)**

Commit together with Task 10.

### Task 10: Slim the orchestrator (`ImportReviewFlow.svelte`)

**Files:**
- Modify: `apps/web-svelte/src/lib/components/import/ImportReviewFlow.svelte` (remove sub-steps + epoch machinery; default-import; conditional confirm; bug fixes)

- [ ] **Step 1: Remove the sub-step state machine + duplicate epoch machinery**

Delete:
- imports of `ImportReviewDuplicatesStep` and `ImportReviewFinalizeStep` (lines 3, 5); add imports for `DuplicateBanner` and `ImportConfirmSheet`.
- `type ReviewStep` (line 50), `reviewStep` state (line 56), `reviewSteps`/`stepIndex` (lines 147–152, 154), `goToStep` (lines ~622–632).
- all epoch/auto-mark members: `dupMarkEpoch`, `autoDupInflightIds`, `autoDupPromises`, `autoDupHandledIds` (lines 60–66); `dupActionsReady`, `dupEpoch`, `isDupEpochCurrent`, `bumpDupMarkEpoch`, `isRowAutoDupSettled`, `waitForAutoDupMark`, `getRowSnapshot`, `resyncRowDecisionIfStale` (lines 156–195); the auto-mark `$effect` (lines 197–206) and `scheduleAutoMarkDuplicate` (lines 208–227).
- the `autoDupEpoch` option from `patchRow` (lines 266–270, 297–299) — `patchRow` keeps the optimistic-update + rollback body but drops the epoch guard and resync. Bug #1/#3 fixes are Steps 5–6.

- [ ] **Step 2: Update derived row sets for default-import**

The `FilterKind` becomes `"all" | "uncategorized" | "income" | "expense"`. Replace the filter/derived block (lines 51, 57, 110–145) so:

```ts
  type FilterKind = "all" | "uncategorized" | "income" | "expense";
  let filter = $state<FilterKind>("all");

  // activeRows = rows the user is deciding on (not auto-skipped duplicates).
  const activeRows = $derived(rows.filter((r) => r.decision !== "duplicate"));
  const importRows = $derived(rows.filter((r) => r.decision === "import"));
  const skippedRows = $derived(rows.filter((r) => r.decision === "skip"));
  const duplicateRows = $derived(rows.filter((r) => r.decision === "duplicate"));
  const uncategorizedImportRows = $derived(
    importRows.filter((r) => r.selected_category_id == null)
  );

  const filterCounts = $derived({
    all: activeRows.length,
    uncategorized: activeRows.filter((r) => r.selected_category_id == null).length,
    income: activeRows.filter((r) => r.type === "income").length,
    expense: activeRows.filter((r) => r.type === "expense").length,
  });

  const visibleRows = $derived.by(() => {
    switch (filter) {
      case "uncategorized":
        return activeRows.filter((r) => r.selected_category_id == null);
      case "income":
        return activeRows.filter((r) => r.type === "income");
      case "expense":
        return activeRows.filter((r) => r.type === "expense");
      default:
        return activeRows;
    }
  });

  // Bulk actions are BOTH scoped to the current filter (fixes bug #1).
  const bulkSkippableVisibleCount = $derived(
    visibleRows.filter((r) => r.decision === "import").length
  );
  const bulkRestorableVisibleCount = $derived(
    visibleRows.filter((r) => r.decision === "skip").length
  );

  const filterOptions: { kind: FilterKind; label: string }[] = $derived([
    { kind: "all", label: m.bank_review_filter_all() },
    { kind: "uncategorized", label: m.bank_review_filter_uncategorized() },
    { kind: "income", label: m.bank_review_filter_income() },
    { kind: "expense", label: m.bank_review_filter_expense() },
  ]);
```

Delete `pendingCount`, `canProceedCategorize`, `bulkImportableCount` (lines 107–108, 138–141) — no longer used.

- [ ] **Step 3: Replace import/skip decision logic with a skip toggle**

Remove `ensureRulesThenImport`, `markImport`, `bulkImportValid`, `ruleGroupKey` (lines 320–358 region). Replace with:

```ts
  async function toggleSkip(row: ImportRow): Promise<void> {
    await patchRow(row.id, { decision: row.decision === "skip" ? "import" : "skip" });
  }

  async function bulkSkipVisible(): Promise<void> {
    const targets = visibleRows.filter((r) => r.decision === "import");
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "skip" })));
  }

  async function bulkRestoreVisible(): Promise<void> {
    const targets = visibleRows.filter((r) => r.decision === "skip");
    await Promise.all(targets.map((r) => patchRow(r.id, { decision: "import" })));
  }
```

- [ ] **Step 4: Duplicate banner actions (no epoch)**

Replace `importDuplicateAnyway` and `restoreAllDuplicates` (lines ~604–620) with:

```ts
  async function importDuplicateAnyway(row: ImportRow): Promise<void> {
    await patchRow(row.id, { decision: "import" });
  }

  async function restoreAllDuplicates(): Promise<void> {
    const flagged = rows.filter((r) => r.decision === "duplicate");
    await Promise.all(flagged.map((r) => patchRow(r.id, { decision: "import" })));
  }
```

The `warningsQuery` stays (read-only `previewFingerprintWarnings`) and now feeds banner detail only — keep `warningsByRow`, `duplicateDetail`.

- [ ] **Step 5: Fix undo-rule clobber (bug #3)**

In `undoSavedRule` (lines ~390–404), only restore rows whose current category still equals the rule-applied value (skip rows the user diverged since). Replace its body's restore loop:

```ts
  async function undoSavedRule(
    ruleId: string,
    changedRows: UndoSnapshot[],
    appliedCategoryId: string
  ): Promise<void> {
    try {
      await deleteCategorizationRule(ruleId);
      const current = queryClient.getQueryData<ImportRow[]>(rowsKey) ?? [];
      await Promise.all(
        changedRows
          .filter((snap) => {
            const now = current.find((r) => r.id === snap.id);
            // Skip rows the user re-categorized after the rule applied.
            return now?.selected_category_id === appliedCategoryId;
          })
          .map((row) =>
            patchRow(row.id, {
              selected_category_id: row.selected_category_id,
              decision: row.decision,
            })
          )
      );
      await queryClient.invalidateQueries({ queryKey: ["categorization_rules"] });
      toast.success(m.bank_review_rule_undone());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }
```

Update the call site in `createAndApplyRule` (line ~430) to pass `created.category_id`:
```ts
        onClick: () => void undoSavedRule(created.id, snapshots, created.category_id),
```

- [ ] **Step 6: Fix partial rule-apply (bug #4)**

In `createAndApplyRule` (lines ~424–428), replace the fire-all `Promise.all` apply with a settle-and-report so a mid-batch failure surfaces:

```ts
    const results = await Promise.allSettled(
      targets.map((r) => patchRow(r.id, { selected_category_id: created.category_id }))
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) toast.error(m.toast_error());
```

(`patchRow` already rolls back its own optimistic update on throw; this just informs the user the rule applied to fewer rows than expected. The created rule remains — undo is still offered.)

- [ ] **Step 7: Conditional commit + footer**

Add confirm-sheet state and a `commitOrConfirm` gate near `commitMut` (lines ~640–657):

```ts
  let confirmOpen = $state(false);

  const inneRows = $derived(uncategorizedImportRows);
  const needsConfirm = $derived(inneRows.length > 0 || duplicateRows.length > 0);

  function commitOrConfirm(): void {
    if (needsConfirm) confirmOpen = true;
    else commitMut.mutate();
  }

  function confirmCommit(): void {
    confirmOpen = false;
    commitMut.mutate();
  }
```

In `commitMut.onError`, drop the `category_required`/`rows_pending` branches that can no longer fire is optional; leave them — harmless.

- [ ] **Step 8: Replace the `decisionControl` snippet with a skip toggle**

Replace the snippet (lines ~660–698) with:

```svelte
{#snippet decisionControl(row: ImportRow)}
  <button
    type="button"
    class={cn(
      "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
      row.decision === "skip"
        ? "border-white/10 text-slate-400 hover:bg-white/5"
        : "border-accent/40 bg-accent/15 text-accent"
    )}
    aria-pressed={row.decision !== "skip"}
    aria-label={m.bank_review_import_aria_label({
      description: row.counterparty ?? row.edited_description ?? row.description,
    })}
    onclick={() => void toggleSkip(row)}
  >
    {row.decision === "skip" ? m.bank_review_row_restore() : m.bank_review_row_skip()}
  </button>
{/snippet}
```

- [ ] **Step 9: Replace the template body (steps row → single surface)**

Replace the whole template after the snippet (lines ~700–780) with one surface: source line, `DuplicateBanner`, the rebuilt `ImportReviewCategorizeStep`, a sticky commit footer, and `ImportConfirmSheet`. Remove the `<ol>` review-steps pill row entirely.

```svelte
<div class="space-y-4">
  {#if accountQuery.data}
    <p class="rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
      {m.bank_review_account_destination({
        bank: bankKindLabel(accountQuery.data.kind),
        account: accountQuery.data.label,
      })}
    </p>
  {/if}

  <DuplicateBanner
    {duplicateRows}
    {duplicateDetail}
    {warningsByRow}
    onImportAnyway={(row) => void importDuplicateAnyway(row)}
    onRestoreAll={() => void restoreAllDuplicates()}
  />

  <ImportReviewCategorizeStep
    {parseErrorCount}
    largeRowCount={rows.length}
    {bulkSkippableVisibleCount}
    {bulkRestorableVisibleCount}
    {filter}
    {filterCounts}
    {filterOptions}
    {visibleRows}
    totalActiveRows={activeRows.length}
    {ruleSuggestions}
    {ruleSaving}
    groups={groupsQuery.data ?? []}
    {categoriesFor}
    {createCategoryInline}
    {needsRule}
    {matchedRuleFor}
    {ruleAttributionText}
    onFilterChange={(k) => (filter = k)}
    onClearFilter={() => (filter = "all")}
    onBulkSkipVisible={() => void bulkSkipVisible()}
    onBulkRestoreVisible={() => void bulkRestoreVisible()}
    onSaveSuggestion={(s) => void saveSuggestion(s)}
    onQuickSaveRule={(row) => void quickSaveRule(row)}
    onPatchRow={(id, patch) => void patchRow(id, patch)}
    onOpenRuleSettings={openRuleInSettings}
    {decisionControl}
  />

  <div
    class="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-slate-950/95 px-4 py-3 pb-(--mobile-action-bottom) backdrop-blur md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
  >
    <div class="min-w-0 text-xs text-slate-400">
      {#if importRows.length === 0}
        <span class="text-amber-300">{m.bank_review_commit_zero_hint()}</span>
      {:else}
        {m.bank_review_footer_counts({
          imp: importRows.length,
          skip: skippedRows.length,
          inne: uncategorizedImportRows.length,
        })}
      {/if}
    </div>
    <div class="flex gap-2">
      <Button variant="ghost" onclick={() => void onCancel()} disabled={commitMut.isPending}>
        {m.bank_review_cancel()}
      </Button>
      <Button
        variant="primary"
        disabled={importRows.length === 0 || commitMut.isPending}
        loading={commitMut.isPending}
        onclick={commitOrConfirm}
      >
        {m.bank_review_commit_action({ count: importRows.length })}
      </Button>
    </div>
  </div>
</div>

<ImportConfirmSheet
  open={confirmOpen}
  importCount={importRows.length}
  skipCount={skippedRows.length}
  dupCount={duplicateRows.length}
  {inneRows}
  commitPending={commitMut.isPending}
  onClose={() => (confirmOpen = false)}
  onCommit={confirmCommit}
/>
```

Add `import Button from "$lib/components/ui/Button.svelte";` if not already imported.

- [ ] **Step 10: Delete the now-orphaned sub-step components**

```bash
git rm apps/web-svelte/src/lib/components/import/ImportReviewDuplicatesStep.svelte \
       apps/web-svelte/src/lib/components/import/ImportReviewFinalizeStep.svelte
```
Confirm no other importers: `grep -rn "ImportReviewDuplicatesStep\|ImportReviewFinalizeStep" apps/web-svelte/src` → no matches.

- [ ] **Step 11: Gate the whole increment**

Run (from `apps/web-svelte/`):
- `pnpm exec svelte-check --tsconfig ./tsconfig.json` → 0 errors, 0 warnings
- `pnpm lint` → 0 errors
- `pnpm format` then `pnpm format:check`
- Secret grep on changed files: `grep -rE "(eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|PRIVATE|password\s*=)" <changed files>` → no hits

- [ ] **Step 12: Manual smoke (local Supabase up + seeded)**

Upload an mBank CSV with a known duplicate. Verify: duplicates pre-skipped behind the banner; rows default to importing; toggling a row to "Pomiń"; categorize a row + optional "Zapisz regułę"; footer counts live; commit with an uncategorized row opens the confirm sheet listing it under "Trafią do Inne"; commit redirects to `/transactions`.

- [ ] **Step 13: Commit**

```bash
git add apps/web-svelte/src/lib/components/import/ImportReviewFlow.svelte \
        apps/web-svelte/src/lib/components/import/ImportReviewCategorizeStep.svelte
git add -A apps/web-svelte/src/lib/components/import/
git commit -m "feat(import): single default-import review surface, folded dups, optional rules (#73)

Collapse duplicates/categorize/finalize sub-steps into one surface.
Rows default to import; duplicates auto-skipped into a banner; per-row
skip toggle replaces the Importuj/Pomiń group; bulk skip/restore both
scoped to the current filter (fixes bulk-scope mismatch); conditional
commit confirm. Drops the client epoch/auto-mark machinery and the
required-rule gate. Fixes undo-rule clobber + partial-apply reporting."
```

---

## Increment 4 — E2E + final gates

### Task 11: Rewrite Playwright per the regression matrix

**Files:**
- Modify: `apps/web-svelte/e2e/tests/bank-import.spec.ts`

- [ ] **Step 1: Update/remove the duplicate-step helpers**

Remove `advanceDuplicates`/`restoreAll` helpers (lines ~350–365) that click "Dalej"/"Przywróć wszystkie" through a sub-step. The dup flow is now a banner on the single surface — no "Dalej".

- [ ] **Step 2: Rewrite "uploads → flags dup → commits → blocks re-import" (lines ~432–476)**

New assertions: after upload, the dup banner shows `Wykryto`/`pominięto jako duplikat`; the dup row is NOT in the main table; non-dup rows render as importing; click the primary `Zaimportuj …` button; because dups were auto-skipped, the `Potwierdź import` sheet opens (`needsConfirm`); assert `Pominięte jako duplikat` line; click `Potwierdź (N)`; assert redirect URL; re-upload same file → `Ten plik został już zaimportowany`.

- [ ] **Step 3: Rewrite "explicit Importuj → Inne" (lines ~516–545)**

Default-import means the row already imports. New flow: upload a single uncategorized row; assert it shows the "Pomiń" toggle (importing by default, `aria-pressed="true"`); click the primary commit; confirm sheet opens with `Trafią do „Inne”`; assert `Dodaj 1 · pomiń 0`; `Potwierdź (1)`; redirect.

- [ ] **Step 4: Delete "failed required-rule blocks the row" (lines ~548–574)**

The required-rule gate is removed; this test no longer applies. Delete it.

- [ ] **Step 5: Update prefill-failure tests (lines ~577–614)**

Replace the `await expect(page.getByRole("button", { name: /^Importuj gotowe/ })).toHaveCount(0)` assertions with an assertion that the surface still renders the row and the primary `Zaimportuj` button is present (prefill failure must not block default-import).

- [ ] **Step 6: Keep + sanity-check the structural tests (lines ~371–429)**

`renders heading, step pill and upload dropzone`, `invalid CSV`, `selected file retained` stay. The step pills are still `Wgraj plik`/`Sprawdź pozycje` (page-level stepper unchanged); the assertion that `Duplikaty`/`Zakończono` have count 0 still holds (even truer now).

- [ ] **Step 7: Run the e2e suite**

Run: `pnpm test:e2e -- bank-import` (or the project's Playwright command; check `package.json` scripts)
Expected: all bank-import specs PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web-svelte/e2e/tests/bank-import.spec.ts
git commit -m "test(import): rewrite bank-import e2e for v2 single-surface flow (#73)"
```

### Task 12: Full gate sweep + handoff

- [ ] **Step 1: Run every gate from `apps/web-svelte/`**

- `pnpm exec svelte-check --tsconfig ./tsconfig.json` → 0/0
- `pnpm lint` → 0 errors
- `pnpm format:check`
- Unit + RLS focused: `pnpm test -- import` and `pnpm test -- mark_preview_duplicates commit_import_session`
- From repo root: `supabase db reset` clean through `20260609000000`

- [ ] **Step 2: Update CLAUDE.md + memory**

Add an "issue #73" line to the bank-import status section of root `CLAUDE.md` and `~/.claude/projects/.../memory/project_state.md` (new migration `20260609000000`, single-surface flow, default-import).

- [ ] **Step 3: Final commit list output**

Produce the mandatory ordered Conventional Commit list (already created per-task above) and note `Closes #73` on the last commit. User commits/pushes manually.

---

## Self-Review

**Spec coverage:**
- Header label (issue #1) → Task 6. ✓
- Single surface / not-intuitive (#2) → Tasks 9–10. ✓
- Duplicates folded (#3) → Tasks 1,3,7,10. ✓
- Categorize declutter + label jargon (#4) → Tasks 5,9. ✓
- Save-rule / rules verification (#5) → bugs #3/#4 fixed in Task 10; engine unchanged. ✓
- Copy księga→transakcji (#6) → Task 5. ✓
- Default-import / conditional confirm / optional rules → Tasks 3,9,10. ✓
- Out of scope (multi-draft, virtualization, AI, bug #5 re-match) → not planned, per spec. ✓

**Type consistency:** `FilterKind` redefined identically in both `ImportReviewFlow` (Task 10 Step 2) and `ImportReviewCategorizeStep` (Task 9 Step 1) as `"all" | "uncategorized" | "income" | "expense"`. `markPreviewDuplicates` returns `DuplicateWarning[]` (Task 3) consumed only at upload (Task 4) — the orchestrator reads warnings via the existing read-only `previewFingerprintWarnings` query. `decisionControl` snippet signature `Snippet<[ImportRow]>` unchanged (Task 9 keeps the prop; Task 10 supplies new content). New message keys referenced in Tasks 6–10 are all defined in Task 5 / Task 6 Step 2.

**Placeholder scan:** RLS test (Task 2) is a skeleton by necessity (must adapt to the existing harness helpers, which the executor reads first) — every assertion is enumerated. No other placeholders.
