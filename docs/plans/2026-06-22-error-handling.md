# Error Handling (UI/UX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace blanket "Coś poszło nie tak" handling with a central error→message mapper applied consistently across the key transactions/plans/settings write and read flows.

**Architecture:** A pure classifier (`classifyError`) + a Paraglide-backed resolver (`errorMessage`) in `services/supabase-errors.ts`; a thin `toastError` wrapper; a reusable `<QueryError>` component. Call-sites swap generic toasts/blocks for these. Spec: `docs/specs/2026-06-21-error-handling-design.md`.

**Tech Stack:** SvelteKit (adapter-static), Svelte 5 runes, TanStack Query v6, Paraglide v2, svelte-sonner toasts, Vitest (unit + components).

## Global Constraints

- All commands run from `apps/web-svelte/`.
- After any `messages/pl.json` edit: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide` before svelte-check.
- Gates per increment: `pnpm exec svelte-check --tsconfig ./tsconfig.json` (0/0), `pnpm lint` (0 errors; 5 pre-existing paraglide warnings OK), `pnpm format:check`.
- `createMutation` is NOT a store: use `mutation.error`, `mutation.isPending` directly (no `$`).
- a11y contrast floor: muted text ≥ `text-slate-400`; error line `text-rose-300`.
- Toast import: `import { toast } from "svelte-sonner";`.
- Out of scope: admin surfaces, import-flow internals, offline queue, global error boundary.

---

### Task 1: Error classifier + resolver + copy keys

**Files:**
- Modify: `src/lib/services/supabase-errors.ts` (append; keep existing exports)
- Modify: `messages/pl.json` (add `error_*` keys)
- Test: `tests/unit/supabase-errors.spec.ts` (create)

**Interfaces:**
- Consumes: existing `extractPostgrestError`, `postgrestErrorCode` from this file.
- Produces:
  - `type ErrorKind = "network" | "permission" | "duplicate" | "in_use" | "validation" | "session_expired" | "custom" | "generic"`
  - `classifyError(err: unknown): { kind: ErrorKind; detail?: string }`
  - `errorMessage(err: unknown, opts?: { fallback?: string; overrides?: Record<string, string> }): string`

- [ ] **Step 1: Add the `error_*` copy keys to `messages/pl.json`**

Insert these keys (anywhere in the JSON object, e.g. after `"common_retry"`):

```json
  "error_network": "Brak połączenia z internetem.",
  "error_permission": "Brak uprawnień do tej operacji.",
  "error_duplicate": "Taki wpis już istnieje.",
  "error_in_use": "Nie można usunąć — pozycja jest w użyciu.",
  "error_validation": "Sprawdź wprowadzone dane.",
  "error_session_expired": "Sesja wygasła. Zaloguj się ponownie.",
  "error_generic": "Coś poszło nie tak. Spróbuj ponownie.",
```

- [ ] **Step 2: Recompile Paraglide**

Run: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`
Expected: "Successfully compiled inlang project."

- [ ] **Step 3: Write the failing test for `classifyError`**

Create `tests/unit/supabase-errors.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyError, errorMessage } from "$lib/services/supabase-errors";

describe("classifyError", () => {
  it("classifies a fetch TypeError as network", () => {
    expect(classifyError(new TypeError("Failed to fetch")).kind).toBe("network");
  });

  it("maps known Postgres codes", () => {
    expect(classifyError({ code: "42501" }).kind).toBe("permission");
    expect(classifyError({ code: "23505" }).kind).toBe("duplicate");
    expect(classifyError({ code: "23503" }).kind).toBe("in_use");
    expect(classifyError({ code: "23502" }).kind).toBe("validation");
    expect(classifyError({ code: "23514" }).kind).toBe("validation");
    expect(classifyError({ code: "22P02" }).kind).toBe("validation");
    expect(classifyError({ code: "PGRST301" }).kind).toBe("session_expired");
  });

  it("treats a 401 status (no code) as session expired", () => {
    expect(classifyError({ status: 401 }).kind).toBe("session_expired");
  });

  it("carries the hint for custom P0001 raises", () => {
    expect(classifyError({ code: "P0001", hint: "Tylko właściciel." })).toEqual({
      kind: "custom",
      detail: "Tylko właściciel.",
    });
  });

  it("falls back to generic for unknown / empty", () => {
    expect(classifyError({ code: "99999" }).kind).toBe("generic");
    expect(classifyError(null).kind).toBe("generic");
  });
});

describe("errorMessage", () => {
  it("prefers a per-code override", () => {
    expect(errorMessage({ code: "23503" }, { overrides: { "23503": "Kategoria w użyciu" } })).toBe(
      "Kategoria w użyciu"
    );
  });

  it("uses a custom raise's hint as the message", () => {
    expect(errorMessage({ code: "P0001", hint: "Tylko właściciel." })).toBe("Tylko właściciel.");
  });

  it("uses the provided fallback for unknown errors", () => {
    expect(errorMessage({ code: "99999" }, { fallback: "Nie udało się zapisać." })).toBe(
      "Nie udało się zapisać."
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm exec vitest run --config vitest.unit.config.ts supabase-errors`
Expected: FAIL — `classifyError`/`errorMessage` not exported.

- [ ] **Step 5: Implement classifier + resolver**

Append to `src/lib/services/supabase-errors.ts`:

```ts
import * as m from "$lib/paraglide/messages";

export type ErrorKind =
  | "network"
  | "permission"
  | "duplicate"
  | "in_use"
  | "validation"
  | "session_expired"
  | "custom"
  | "generic";

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && /fetch/i.test(err.message)) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = (err as { message?: string } | null)?.message;
  return !!msg && /failed to fetch|networkerror|load failed/i.test(msg);
}

/** Pure classification — no i18n, fully unit-testable. */
export function classifyError(err: unknown): { kind: ErrorKind; detail?: string } {
  if (isNetworkError(err)) return { kind: "network" };
  const e = extractPostgrestError(err);
  switch (e?.code) {
    case "42501":
      return { kind: "permission" };
    case "23505":
      return { kind: "duplicate" };
    case "23503":
      return { kind: "in_use" };
    case "23502":
    case "23514":
    case "22P02":
      return { kind: "validation" };
    case "401":
    case "PGRST301":
      return { kind: "session_expired" };
    case "P0001":
      return { kind: "custom", detail: e?.hint?.trim() || e?.message?.trim() || undefined };
  }
  if ((err as { status?: number } | null)?.status === 401) return { kind: "session_expired" };
  return { kind: "generic" };
}

export interface ErrorMessageOpts {
  fallback?: string;
  overrides?: Record<string, string>;
}

/** Resolve a user-facing Polish message for any thrown error. */
export function errorMessage(err: unknown, opts: ErrorMessageOpts = {}): string {
  const code = postgrestErrorCode(err);
  if (code && opts.overrides?.[code]) return opts.overrides[code];
  const { kind, detail } = classifyError(err);
  switch (kind) {
    case "network":
      return m.error_network();
    case "permission":
      return m.error_permission();
    case "duplicate":
      return m.error_duplicate();
    case "in_use":
      return m.error_in_use();
    case "validation":
      return m.error_validation();
    case "session_expired":
      return m.error_session_expired();
    case "custom":
      return detail ?? opts.fallback ?? m.error_generic();
    default:
      return opts.fallback ?? m.error_generic();
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm exec vitest run --config vitest.unit.config.ts supabase-errors`
Expected: PASS (all cases).

- [ ] **Step 7: Gates + commit**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json` (0/0), `pnpm lint`, `pnpm format`.

```bash
git add src/lib/services/supabase-errors.ts messages/pl.json src/lib/paraglide tests/unit/supabase-errors.spec.ts
git commit -m "feat(errors): classifyError + errorMessage mapper with error_* copy"
```

---

### Task 2: `toastError` helper

**Files:**
- Create: `src/lib/toast-error.ts`

**Interfaces:**
- Consumes: `errorMessage` (Task 1), `toast` from `svelte-sonner`.
- Produces: `toastError(err: unknown, opts?: ErrorMessageOpts): void`

- [ ] **Step 1: Implement the helper**

Create `src/lib/toast-error.ts`:

```ts
import { toast } from "svelte-sonner";
import { errorMessage, type ErrorMessageOpts } from "$lib/services/supabase-errors";

/** Toast a mapped, user-facing message for a thrown error. */
export function toastError(err: unknown, opts?: ErrorMessageOpts): void {
  toast.error(errorMessage(err, opts));
}
```

- [ ] **Step 2: Gates + commit**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json`, `pnpm lint`, `pnpm format`.

```bash
git add src/lib/toast-error.ts
git commit -m "feat(errors): toastError wrapper"
```

---

### Task 3: `<QueryError>` component

**Files:**
- Create: `src/lib/components/ui/QueryError.svelte`
- Test: `tests/components/QueryError.spec.ts` (create)

**Interfaces:**
- Consumes: `errorMessage` (Task 1), `m.common_retry` (exists in `pl.json`).
- Produces: `<QueryError error={unknown} onRetry?={() => void} />`

- [ ] **Step 1: Write the failing component test**

Create `tests/components/QueryError.spec.ts`:

```ts
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import QueryError from "$lib/components/ui/QueryError.svelte";

describe("QueryError", () => {
  it("renders the mapped message for a permission error", () => {
    render(QueryError, { error: { code: "42501" } });
    expect(screen.getByText("Brak uprawnień do tej operacji.")).toBeInTheDocument();
  });

  it("shows a retry button only when onRetry is given and fires it", async () => {
    const onRetry = vi.fn();
    render(QueryError, { error: { code: "99999" }, onRetry });
    await userEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits the retry button when no onRetry", () => {
    render(QueryError, { error: { code: "99999" } });
    expect(screen.queryByRole("button")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run --config vitest.components.config.ts QueryError`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

Create `src/lib/components/ui/QueryError.svelte`:

```svelte
<script lang="ts">
  import { errorMessage } from "$lib/services/supabase-errors";
  import * as m from "$lib/paraglide/messages";

  let { error, onRetry }: { error: unknown; onRetry?: () => void } = $props();
</script>

<div class="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-center">
  <p class="text-sm text-rose-300">{errorMessage(error)}</p>
  {#if onRetry}
    <button
      type="button"
      onclick={onRetry}
      class="focus-visible:ring-accent mt-2 rounded-full border border-white/10 bg-slate-900/60 px-4 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
    >
      {m.common_retry()}
    </button>
  {/if}
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run --config vitest.components.config.ts QueryError`
Expected: PASS.

- [ ] **Step 5: Gates + commit**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json`, `pnpm lint`, `pnpm format`.

```bash
git add src/lib/components/ui/QueryError.svelte tests/components/QueryError.spec.ts
git commit -m "feat(errors): QueryError component (message + retry)"
```

---

### Task 4: Roll out transactions flows

**Files:**
- Modify: `src/lib/components/transactions/TransactionDialog.svelte`
- Modify: `src/routes/transactions/+page.svelte` (row delete, bulk delete, quick-settle `onError`; list `isError` block)
- Modify: `src/lib/components/transactions/BulkActionsBar.svelte` (if it owns the bulk mutation)

**Interfaces:**
- Consumes: `toastError` (Task 2), `errorMessage` (Task 1), `<QueryError>` (Task 3).

- [ ] **Step 1: TransactionDialog — inline message + toast**

In `src/lib/components/transactions/TransactionDialog.svelte`:
- Add import: `import { errorMessage } from "$lib/services/supabase-errors";` and `import { toastError } from "$lib/toast-error";`
- Replace the inline block:

```svelte
{#if mutation.isError}
  <p class="text-sm text-rose-300">{m.common_error_title()}</p>
{/if}
```

with:

```svelte
{#if mutation.isError}
  <p class="text-sm text-rose-300">{errorMessage(mutation.error)}</p>
{/if}
```

- Replace each `onError: () => toast.error(m.toast_error())` in this file with `onError: (err) => toastError(err)`.

- [ ] **Step 2: transactions page — toasts + list QueryError**

In `src/routes/transactions/+page.svelte`:
- Add imports: `import { toastError } from "$lib/toast-error";` and `import QueryError from "$lib/components/ui/QueryError.svelte";`
- Replace each `onError: () => toast.error(m.toast_error())` (delete, bulk delete, quick-settle) with `onError: (err) => toastError(err)`.
- Replace the list error block. Find the transactions query (named e.g. `txQuery`) `{:else if txQuery.isError}` branch and render:

```svelte
{:else if txQuery.isError}
  <QueryError error={txQuery.error} onRetry={() => txQuery.refetch()} />
```

- [ ] **Step 3: Gate — type + behavior**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json` (0/0).
Run: `pnpm exec playwright test transactions`
Expected: PASS (existing add/delete/bulk/quick-settle toasts still fire).

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/transactions/ src/routes/transactions/+page.svelte
git commit -m "feat(errors): map transactions flow errors (inline + toast + QueryError)"
```

---

### Task 5: Roll out plans flows

**Files:**
- Modify: `src/routes/plans/+page.svelte` (plan create/update/delete, link/unlink settle, debt terms, refinance `onError`; hub `isError`)
- Modify: plan dialog/detail components under `src/lib/components/plans/` that own mutations (`SavePlanDetail`, `DebtPlanDetail`, settle/refinance forms)

**Interfaces:**
- Consumes: `toastError`, `errorMessage`, `<QueryError>`.

- [ ] **Step 1: Swap toasts + inline**

In `src/routes/plans/+page.svelte` and the plan components above:
- Add `import { toastError } from "$lib/toast-error";` (and `errorMessage` where an inline form error is shown).
- Replace each `onError: () => toast.error(m.toast_error())` with `onError: (err) => toastError(err)`.
- For inline form errors currently showing `m.common_error_title()` / `m.toast_error()`, render `{errorMessage(mutation.error)}`.

- [ ] **Step 2: Hub QueryError**

In `src/routes/plans/+page.svelte`, add `import QueryError from "$lib/components/ui/QueryError.svelte";` and replace the plans-hub `{:else if plansQuery.isError}` block:

```svelte
{:else if plansQuery.isError}
  <QueryError error={plansQuery.error} onRetry={() => plansQuery.refetch()} />
```

- [ ] **Step 3: Gate**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json` (0/0).
Run: `pnpm exec playwright test plans plan-settle`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/plans/+page.svelte src/lib/components/plans/
git commit -m "feat(errors): map plans flow errors (inline + toast + QueryError)"
```

---

### Task 6: Roll out settings flows

**Files:**
- Modify: `src/lib/components/settings/CategoriesTab.svelte`, `RulesTab.svelte`, `RuleEditDialog.svelte`, `GroupsTab.svelte`, `ProfileTab.svelte`, `PersonalizationTab.svelte`

**Interfaces:**
- Consumes: `toastError`, `errorMessage`, `<QueryError>`.

- [ ] **Step 1: Swap toasts, preserving existing code-specific copy via `overrides`**

In each file:
- Add `import { toastError } from "$lib/toast-error";`
- Replace `onError: () => toast.error(m.toast_error())` with `onError: (err) => toastError(err)`.
- `CategoriesTab.svelte` already special-cases `23503` → keep that copy by passing an override instead of the ad-hoc `if`:

Replace:

```ts
onError: (err: { code?: string }) => {
  if (err?.code === "23503") toast.error(m.toast_category_in_use());
  else toast.error(m.toast_error());
},
```

with:

```ts
onError: (err) => toastError(err, { overrides: { "23503": m.toast_category_in_use() } }),
```

- `RuleEditDialog.svelte` currently does `toast.error(err.message || m.toast_error())` → replace with `toastError(err)` (the mapper handles `message`/codes).

- [ ] **Step 2: Settings tab QueryError blocks**

In `CategoriesTab.svelte` and `RulesTab.svelte`, add `import QueryError from "$lib/components/ui/QueryError.svelte";` and replace each `{:else if query.isError}` / `{:else if rulesQuery.isError}` block with:

```svelte
{:else if query.isError}
  <QueryError error={query.error} onRetry={() => query.refetch()} />
```

(use the actual query variable name in each file).

- [ ] **Step 3: Gate + commit**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json` (0/0), `pnpm lint`.

```bash
git add src/lib/components/settings/
git commit -m "feat(errors): map settings flow errors (toast overrides + QueryError)"
```

---

### Task 7: Roll out dashboard card query errors

**Files:**
- Modify: dashboard cards under `src/lib/components/dashboard/` that expose a query `isError` state (`DashboardPlanProgress.svelte`, `DashboardNetWorthStrip.svelte`, `DashboardImportHealth.svelte`, `DashboardAttention.svelte`) and `src/routes/dashboard/+page.svelte` where card-level queries surface errors.

**Interfaces:**
- Consumes: `<QueryError>` (Task 3).

- [ ] **Step 1: Add QueryError to card error states**

For each dashboard card that has an `{:else if someQuery.isError}` branch (or add one where a card silently renders empty on error), import and render:

```svelte
{:else if someQuery.isError}
  <QueryError error={someQuery.error} onRetry={() => someQuery.refetch()} />
```

Keep it inside the card's existing container so layout is unchanged. Do NOT add error UI to cards that intentionally degrade silently (e.g. import-health when no sessions) — only where a failed fetch currently shows nothing or a generic line.

- [ ] **Step 2: Gate**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json` (0/0).
Run: `pnpm exec playwright test a11y-spine`
Expected: PASS (no contrast regressions on `/dashboard`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/dashboard/ src/routes/dashboard/+page.svelte
git commit -m "feat(errors): QueryError on dashboard card failures"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full gates**

Run: `pnpm exec svelte-check --tsconfig ./tsconfig.json` (0/0), `pnpm lint` (0 err), `pnpm format:check`, `pnpm test:unit`, `pnpm test:components`.

- [ ] **Step 2: Full mocked E2E**

Run: `pnpm exec playwright test`
Expected: all pass.

- [ ] **Step 3: Secret scan on changed files**

Run: `grep -rE "(eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|PRIVATE|password\s*=)" <changed files>`
Expected: clean.

- [ ] **Step 4: Output the Conventional Commit list** (per repo CLAUDE.md step 7) for manual push.

---

## Self-Review

- **Spec coverage:** Section 1 (taxonomy) → Task 1. Section 2 (helpers+component) → Tasks 1–3. Section 3 (rollout) → Tasks 4–7. Section 4 (testing) → Tasks 1 (unit), 3 (component), 8 (full). All covered.
- **Placeholder scan:** call-site tasks name exact files + the exact before/after; query-variable names are per-file (instructed to use the real name) — acceptable since the transformation is uniform and the variable is visible in each file.
- **Type consistency:** `classifyError` → `{ kind, detail }`; `errorMessage(err, opts)`; `toastError(err, opts)`; `<QueryError error onRetry>` — names consistent across tasks.
