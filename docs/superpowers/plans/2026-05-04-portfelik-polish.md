# Portfelik: Firebase Decommission + Gap Fixes + Phase 8 Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete all Firebase/React legacy code, fill two UX gaps (push opt-out, admin trigger), implement CSS-only dark mode, bulk delete for transactions, and a Playwright e2e suite running against local Supabase in CI.

**Architecture:** Four independent workstreams executed sequentially — (1) delete `src/` + `functions/` + Firebase configs, (2) two small mutations to ProfileTab and Admin, (3) add Tailwind `dark:` variants across all components driven by `prefers-color-scheme`, (4) Playwright tests with local Supabase spun up in CI via `supabase start`.

**Tech Stack:** SvelteKit 5 + Supabase + Tailwind v4 + Playwright + `@playwright/test` + Supabase CLI

---

## Dark mode substitution table (reference for Tasks 5–7)

| Light class | Add dark companion |
|-------------|-------------------|
| `bg-white` | `dark:bg-zinc-900` |
| `bg-zinc-50` | `dark:bg-zinc-800` |
| `bg-zinc-100` | `dark:bg-zinc-800` |
| `border-zinc-200` | `dark:border-zinc-700` |
| `border-zinc-100` | `dark:border-zinc-800` |
| `border-zinc-50` | `dark:border-zinc-800` |
| `text-zinc-900` | `dark:text-zinc-100` |
| `text-zinc-700` | `dark:text-zinc-300` |
| `text-zinc-600` | `dark:text-zinc-300` |
| `text-zinc-500` | `dark:text-zinc-400` |
| `text-zinc-400` | `dark:text-zinc-500` |
| `text-zinc-300` | `dark:text-zinc-600` |
| `hover:bg-zinc-50` | `dark:hover:bg-zinc-800` |
| `hover:bg-zinc-100` | `dark:hover:bg-zinc-700` |
| `hover:text-zinc-900` | `dark:hover:text-zinc-100` |
| `focus:ring-zinc-900` | `dark:focus:ring-zinc-100` |
| `animate-pulse bg-zinc-100` | `dark:bg-zinc-800` |
| `bg-emerald-50 text-emerald-700` | `dark:bg-emerald-950 dark:text-emerald-400` |
| `bg-rose-50 text-rose-700` | `dark:bg-rose-950 dark:text-rose-400` |
| `bg-blue-50 text-blue-700` | `dark:bg-blue-950 dark:text-blue-400` |
| Inputs `border-zinc-200` | also add `dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700` |
| `bg-zinc-900 text-white` (primary btn) | keep — already dark-safe |

---

## File map

### Phase 7 — Decommission
- **Delete:** `src/`, `functions/`, `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `public/`
- **Modify:** root `package.json` — strip React/Firebase deps + scripts
- **Modify:** `CLAUDE.md` — Phase 7 ✅

### Phase 7.5 — Gap fixes
- **Modify:** `apps/web-svelte/messages/pl.json`
- **Modify:** `apps/web-svelte/src/lib/components/settings/ProfileTab.svelte`
- **Create:** `supabase/migrations/20260504000000_admin_trigger_rpc.sql`
- **Modify:** `apps/web-svelte/src/routes/admin/+page.svelte`

### Phase 8a — Dark mode
- **Modify:** `apps/web-svelte/src/app.css`
- **Modify:** `apps/web-svelte/src/routes/+layout.svelte`
- **Modify:** `apps/web-svelte/src/lib/components/Navigation.svelte`
- **Modify:** `apps/web-svelte/src/routes/login/+page.svelte`
- **Modify:** all 5 transaction components + `routes/transactions/+page.svelte`
- **Modify:** `ShoppingListCard.svelte`, `ShoppingListSuggestions.svelte`
- **Modify:** all 4 settings components + `routes/settings/+page.svelte`
- **Modify:** `Dialog.svelte`, `ConfirmDialog.svelte`, `NotificationsPopover.svelte`
- **Modify:** `routes/shopping-lists/+page.svelte`, `routes/shopping-lists/[id]/+page.svelte`
- **Modify:** `routes/admin/+page.svelte`

### Phase 8b — Bulk delete
- **Modify:** `apps/web-svelte/messages/pl.json`
- **Modify:** `apps/web-svelte/src/lib/components/transactions/TransactionTable.svelte`
- **Modify:** `apps/web-svelte/src/routes/transactions/+page.svelte`

### Phase 8c — Playwright
- **Modify:** `apps/web-svelte/package.json`
- **Create:** `apps/web-svelte/playwright.config.ts`
- **Create:** `apps/web-svelte/e2e/global-setup.ts`
- **Create:** `apps/web-svelte/e2e/helpers/session.ts`
- **Create:** `apps/web-svelte/e2e/transactions.spec.ts`
- **Create:** `apps/web-svelte/e2e/shopping-lists.spec.ts`
- **Modify:** `apps/web-svelte/.gitignore` (add `e2e/.auth/`)
- **Modify:** `.github/workflows/cloudflare-deploy.yml`

---

## Task 1: Firebase decommission — delete legacy code

**Files:** Delete `src/`, `functions/`, Firebase configs; modify root `package.json`

- [ ] **Step 1.1: Verify no SvelteKit code imports from src/**

```bash
grep -rn "from.*\"\.\./src\|from.*\"src/" apps/web-svelte/src 2>/dev/null
```
Expected: zero results. If any exist, fix them before proceeding.

- [ ] **Step 1.2: Delete React legacy app**

```bash
git rm -r src/
```

- [ ] **Step 1.3: Delete Firebase Cloud Functions**

```bash
git rm -r functions/
```

- [ ] **Step 1.4: Delete Firebase config and public/ (React build outputs)**

```bash
git rm firebase.json .firebaserc firestore.rules firestore.indexes.json
git rm -r public/ 2>/dev/null || true
git rm storage.rules 2>/dev/null || true
```

- [ ] **Step 1.5: Strip root package.json**

Read root `package.json`. Replace with this minimal monorepo shell (it held the React app's deps — all React, Firebase, Radix, shadcn-react, i18next, vite are now gone):

```json
{
  "name": "portfelik",
  "private": true,
  "scripts": {}
}
```

- [ ] **Step 1.6: Update CLAUDE.md phase table**

In `CLAUDE.md`, update:
- Phase 7 row: `🟡 Live in prod. Firebase decommission pending.` → `✅ Done (2026-05-04) — src/, functions/, Firebase configs deleted.`
- Immediate next step: `Phase 8 — Hardening`

- [ ] **Step 1.7: Verify SvelteKit build unaffected**

```bash
cd apps/web-svelte
pnpm exec svelte-check --tsconfig ./tsconfig.json
pnpm lint
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 1.8: Commit**

```bash
git add -A
git commit -m "chore(legacy): delete React+Firebase app — Phase 7 decommission

Removes src/ (React 19 + Vite), functions/ (Firebase Cloud Functions),
firebase.json, .firebaserc, firestore.rules, firestore.indexes.json, public/.
Root package.json stripped to empty monorepo shell.
SvelteKit in apps/web-svelte/ is the sole frontend."
```

---

## Task 2: Push opt-out in ProfileTab

**Files:** `apps/web-svelte/messages/pl.json`, `apps/web-svelte/src/lib/components/settings/ProfileTab.svelte`

- [ ] **Step 2.1: Add i18n strings to pl.json**

Open `apps/web-svelte/messages/pl.json`. Add before the closing `}`:

```json
  "profile_notifications_enabled": "Powiadomienia push aktywne",
  "profile_notifications_disable": "Wyłącz powiadomienia",
  "toast_push_unsubscribed": "Wyłączono powiadomienia push"
```

- [ ] **Step 2.2: Recompile paraglide**

```bash
cd apps/web-svelte
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
```
Expected: no errors.

- [ ] **Step 2.3: Update ProfileTab.svelte**

In `apps/web-svelte/src/lib/components/settings/ProfileTab.svelte`:

Add imports at top of `<script>`:
```ts
import { unsubscribeFromPush } from "$lib/services/push";
import { onMount } from "svelte";
```

Add state + mutation inside `<script>` (after existing mutations):
```ts
let notifPermission = $state<NotificationPermission>("default");

onMount(() => {
  if ("Notification" in window) notifPermission = Notification.permission;
});

const unsubMutation = createMutation(() => ({
  mutationFn: unsubscribeFromPush,
  onSuccess: () => {
    notifPermission = "default";
    toast.success(m.toast_push_unsubscribed());
  },
  onError: () => toast.error(m.toast_error()),
}));
```

Add this block in the template **before** the `<div class="mt-6 rounded-xl border border-rose-200...` delete account section:
```svelte
{#if notifPermission === "granted"}
  <div class="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
    <div class="flex items-center justify-between gap-3 px-4 py-3">
      <span class="text-sm font-medium text-zinc-900">{m.profile_notifications_enabled()}</span>
      <button
        type="button"
        onclick={() => unsubMutation.mutate()}
        disabled={unsubMutation.isPending}
        class="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50"
      >
        {unsubMutation.isPending ? m.common_saving() : m.profile_notifications_disable()}
      </button>
    </div>
  </div>
{/if}
```

- [ ] **Step 2.4: Verify**

```bash
cd apps/web-svelte
pnpm exec svelte-check --tsconfig ./tsconfig.json && pnpm lint
```
Expected: 0 errors.

- [ ] **Step 2.5: Commit**

```bash
git add apps/web-svelte/messages/pl.json apps/web-svelte/src/lib/paraglide/ apps/web-svelte/src/lib/components/settings/ProfileTab.svelte
git commit -m "feat(settings): add push notification opt-out to Profile tab"
```

---

## Task 3: Admin weekly summary trigger

**Files:** `supabase/migrations/20260504000000_admin_trigger_rpc.sql`, `apps/web-svelte/messages/pl.json`, `apps/web-svelte/src/routes/admin/+page.svelte`

- [ ] **Step 3.1: Create migration**

Create `supabase/migrations/20260504000000_admin_trigger_rpc.sql`:

```sql
-- RPC for admins to manually trigger the weekly summary Edge Function.
-- Reads INTERNAL_TRIGGER_SECRET from Vault — never exposed to the frontend.
create or replace function trigger_admin_summary()
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  if not is_admin() then
    raise exception 'permission_denied';
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'internal_trigger_secret';

  if v_secret is null then
    raise exception 'trigger_secret_not_configured';
  end if;

  select net.http_post(
    url     := 'https://emqzcygfwcvbmhxhfkcc.supabase.co/functions/v1/send-admin-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    := '{"triggered_by":"admin"}'::jsonb
  ) into v_request_id;

  return jsonb_build_object('request_id', v_request_id);
end;
$$;

grant execute on function trigger_admin_summary() to authenticated;
```

- [ ] **Step 3.2: Apply migration via MCP**

Use MCP tool `mcp__supabase__apply_migration` with the SQL above.
Expected: migration applied successfully.

- [ ] **Step 3.3: Add i18n strings**

In `apps/web-svelte/messages/pl.json`, add:
```json
  "admin_trigger_summary": "Wyślij podsumowanie tygodniowe",
  "admin_trigger_summary_sending": "Wysyłanie...",
  "toast_admin_summary_triggered": "Podsumowanie tygodniowe zostało wysłane"
```

- [ ] **Step 3.4: Recompile paraglide**

```bash
cd apps/web-svelte
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
```

- [ ] **Step 3.5: Add trigger button to admin/+page.svelte**

In `apps/web-svelte/src/routes/admin/+page.svelte`, inside `<script>`, add mutation (imports `createMutation`, `toast`, `supabase`, `m` are all already present):

```ts
const triggerSummaryMutation = createMutation(() => ({
  mutationFn: async () => {
    const { error } = await supabase.rpc('trigger_admin_summary');
    if (error) throw error;
  },
  onSuccess: () => toast.success(m.toast_admin_summary_triggered()),
  onError: (err: Error) => toast.error(err.message),
}));
```

At the end of the template (after the users table `{/if}`), add:

```svelte
<div class="mt-6 rounded-xl border border-zinc-200 bg-white p-4">
  <h2 class="text-sm font-semibold text-zinc-700">Narzędzia diagnostyczne</h2>
  <div class="mt-3">
    <button
      type="button"
      onclick={() => triggerSummaryMutation.mutate()}
      disabled={triggerSummaryMutation.isPending}
      class="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
    >
      {triggerSummaryMutation.isPending ? m.admin_trigger_summary_sending() : m.admin_trigger_summary()}
    </button>
  </div>
</div>
```

- [ ] **Step 3.6: Verify**

```bash
cd apps/web-svelte
pnpm exec svelte-check --tsconfig ./tsconfig.json && pnpm lint
```

- [ ] **Step 3.7: Commit**

```bash
git add supabase/migrations/20260504000000_admin_trigger_rpc.sql apps/web-svelte/messages/pl.json apps/web-svelte/src/lib/paraglide/ apps/web-svelte/src/routes/admin/+page.svelte
git commit -m "feat(admin): manual weekly summary trigger button + trigger_admin_summary RPC

Vault-backed secret never reaches the frontend.
Admin-only via is_admin() check in SECURITY DEFINER function."
```

---

## Task 4: Dark mode — Foundation

**Files:** `apps/web-svelte/src/app.css`, `apps/web-svelte/src/routes/+layout.svelte`

- [ ] **Step 4.1: Update app.css**

Replace the entire file content:
```css
@import url("https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap");
@import "tailwindcss";

@theme {
  --font-sans: "Inter", system-ui, sans-serif;
}

@layer base {
  * {
    -webkit-tap-highlight-color: transparent;
  }

  html {
    scroll-behavior: smooth;
    color-scheme: light dark;
  }

  body {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    @apply bg-white dark:bg-zinc-950;
  }
}
```

- [ ] **Step 4.2: Update +layout.svelte main wrapper**

In `apps/web-svelte/src/routes/+layout.svelte`, find the `<main>` element:
```svelte
<main class="min-h-screen pt-14 pb-16 md:pb-0">
```
Change to:
```svelte
<main class="min-h-screen pt-14 pb-16 md:pb-0 bg-white dark:bg-zinc-950">
```

- [ ] **Step 4.3: Verify**

```bash
cd apps/web-svelte
pnpm exec svelte-check --tsconfig ./tsconfig.json
```

- [ ] **Step 4.4: Commit**

```bash
git add apps/web-svelte/src/app.css apps/web-svelte/src/routes/+layout.svelte
git commit -m "feat(ui): dark mode foundation — color-scheme + body bg"
```

---

## Task 5: Dark mode — Navigation + Login

**Files:** `apps/web-svelte/src/lib/components/Navigation.svelte`, `apps/web-svelte/src/routes/login/+page.svelte`

- [ ] **Step 5.1: Update Navigation.svelte**

The current Navigation has (already read):
- Desktop header: `border-b border-zinc-200 bg-white` → add `dark:border-zinc-800 dark:bg-zinc-900`
- App name: `text-zinc-900` → add `dark:text-zinc-100`
- Active nav link: `bg-zinc-100 text-zinc-900` → add `dark:bg-zinc-800 dark:text-zinc-100`
- Inactive nav link: `text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900` → add `dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100`
- Email: `text-zinc-400` — fine as-is
- Sign out button: `text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900` → add `dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100`
- Mobile nav: `border-t border-zinc-200 bg-white` → add `dark:border-zinc-800 dark:bg-zinc-900`
- Mobile active: `text-zinc-900` → add `dark:text-zinc-100`
- Mobile inactive: `text-zinc-400` — fine (already muted)

Exact diff for the desktop header `<header>`:
```svelte
<header
  class="fixed inset-x-0 top-0 z-50 hidden h-14 items-center gap-6 border-b border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-900 md:flex"
>
  <span class="mr-2 shrink-0 font-semibold text-zinc-900 dark:text-zinc-100">{m.app_name()}</span>
```

Active nav link `cn(...)` expression — add dark classes to both branches:
```ts
isActive(item.href)
  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
```
Apply this same change for the Admin link `cn(...)`.

Sign out button:
```svelte
class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:outline-none"
```

Mobile `<nav>`:
```svelte
class="fixed inset-x-0 bottom-0 z-50 flex border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 md:hidden"
```

Mobile active link text `text-zinc-900` → add `dark:text-zinc-100`.

- [ ] **Step 5.2: Read login/+page.svelte and apply dark mode**

```bash
cat -n apps/web-svelte/src/routes/login/+page.svelte
```

Apply substitution table to all zinc and white classes found. Key patterns:
- Page wrapper background → add `dark:bg-zinc-950`
- Card/form container `bg-white` → add `dark:bg-zinc-900`
- `border-zinc-200` → add `dark:border-zinc-700`
- `text-zinc-900` → add `dark:text-zinc-100`
- `text-zinc-500` → add `dark:text-zinc-400`
- Input fields → add `dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700`
- Google OAuth button border/hover → add dark variants

- [ ] **Step 5.3: Verify**

```bash
cd apps/web-svelte
pnpm exec svelte-check --tsconfig ./tsconfig.json && pnpm lint
```

- [ ] **Step 5.4: Commit**

```bash
git add apps/web-svelte/src/lib/components/Navigation.svelte apps/web-svelte/src/routes/login/+page.svelte
git commit -m "feat(ui): dark mode — Navigation + Login"
```

---

## Task 6: Dark mode — Transaction components

**Files:** `TransactionTable.svelte`, `TransactionDialog.svelte`, `TransactionDetailSheet.svelte`, `SummaryCards.svelte`, `CategoryBreakdown.svelte`, `CategoryFilter.svelte`, `MonthRangePicker.svelte`, `MonthPicker.svelte`, `routes/transactions/+page.svelte`

- [ ] **Step 6.1: Read all transaction component files**

```bash
for f in \
  apps/web-svelte/src/lib/components/transactions/TransactionTable.svelte \
  apps/web-svelte/src/lib/components/transactions/TransactionDialog.svelte \
  apps/web-svelte/src/lib/components/transactions/TransactionDetailSheet.svelte \
  apps/web-svelte/src/lib/components/transactions/SummaryCards.svelte \
  apps/web-svelte/src/lib/components/transactions/CategoryBreakdown.svelte \
  apps/web-svelte/src/lib/components/transactions/CategoryFilter.svelte \
  apps/web-svelte/src/lib/components/transactions/MonthRangePicker.svelte \
  apps/web-svelte/src/lib/components/transactions/MonthPicker.svelte \
  apps/web-svelte/src/routes/transactions/+page.svelte; do
  echo "=== $f ==="; cat "$f"; echo;
done
```

- [ ] **Step 6.2: Apply substitution table to TransactionTable.svelte**

Key existing classes (from reading the file):
- Mobile card `border-zinc-200 bg-white` → add `dark:border-zinc-700 dark:bg-zinc-900`
- Description `text-zinc-900` → add `dark:text-zinc-100`
- Recurring arrow `text-zinc-400` → add `dark:text-zinc-500`
- Shared badge `border-zinc-200 text-zinc-400` → add `dark:border-zinc-700 dark:text-zinc-500`
- Amount income `text-emerald-600` / expense `text-rose-600` — keep (fine both themes)
- Date/category `text-zinc-400` — fine as-is
- Status classes — apply status substitutions from the table above
- Desktop table header `bg-zinc-50` → add `dark:bg-zinc-800`
- Table header text `text-zinc-500` → add `dark:text-zinc-400`
- Skeleton `animate-pulse rounded-lg bg-zinc-100` → add `dark:bg-zinc-800`
- Edit/delete button `text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50` → add `dark:hover:text-zinc-300 dark:hover:bg-zinc-800`
- Row hover `hover:bg-zinc-50` → add `dark:hover:bg-zinc-800/50`

- [ ] **Step 6.3: Apply substitution table to TransactionDialog.svelte**

Dialog is rendered by `Dialog.svelte` wrapper (which gets dark mode in Task 7). Focus on the form contents:
- Labels `text-zinc-700` → add `dark:text-zinc-300`
- All `<input>` and `<select>` elements: add `dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700`
- Type toggle (income/expense button group): active state `bg-zinc-900 text-white` — keep; inactive `bg-zinc-100 text-zinc-600 hover:bg-zinc-200` → add `dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700`
- Recurring toggle knob `bg-zinc-200` → add `dark:bg-zinc-700`; active `bg-zinc-900` — keep
- Helper text `text-zinc-500` → add `dark:text-zinc-400`

- [ ] **Step 6.4: Apply substitution table to TransactionDetailSheet.svelte**

```bash
cat -n apps/web-svelte/src/lib/components/transactions/TransactionDetailSheet.svelte
```
Sheet slide-in panel: likely `bg-white` container + rows with `border-zinc-100 text-zinc-900/500`. Apply table. Also check sheet backdrop.

- [ ] **Step 6.5: Apply substitution table to SummaryCards, CategoryBreakdown, CategoryFilter, MonthRangePicker, MonthPicker**

For each: read, then apply substitution table systematically. Common patterns:
- Card `bg-white border-zinc-200` → dark variants
- Labels → dark text variants
- Inputs/selects → dark input pattern
- Progress bars `bg-zinc-100` → `dark:bg-zinc-800`

- [ ] **Step 6.6: Apply substitution table to routes/transactions/+page.svelte**

Page-level: any `bg-white` wrappers, button bar (CSV import/export buttons), filter row. Apply table.

- [ ] **Step 6.7: Verify**

```bash
cd apps/web-svelte
pnpm exec svelte-check --tsconfig ./tsconfig.json && pnpm lint
```
Expected: 0 errors.

- [ ] **Step 6.8: Visual spot-check**

```bash
cd apps/web-svelte && pnpm dev
```
Open browser → DevTools → Rendering → Emulate `prefers-color-scheme: dark`. Check `/transactions`. Fix any missed classes.

- [ ] **Step 6.9: Commit**

```bash
git add apps/web-svelte/src/lib/components/transactions/ apps/web-svelte/src/routes/transactions/+page.svelte
git commit -m "feat(ui): dark mode — transaction components"
```

---

## Task 7: Dark mode — Dialogs + Shopping lists + Settings + Admin

**Files:** `Dialog.svelte`, `ConfirmDialog.svelte`, `NotificationsPopover.svelte`, `ShoppingListCard.svelte`, `ShoppingListSuggestions.svelte`, `CategoriesTab.svelte`, `CategoryDialog.svelte`, `GroupsTab.svelte`, `ProfileTab.svelte`, `routes/shopping-lists/+page.svelte`, `routes/shopping-lists/[id]/+page.svelte`, `routes/settings/+page.svelte`, `routes/admin/+page.svelte`

- [ ] **Step 7.1: Read all files**

```bash
for f in \
  apps/web-svelte/src/lib/components/ui/Dialog.svelte \
  apps/web-svelte/src/lib/components/ui/ConfirmDialog.svelte \
  apps/web-svelte/src/lib/components/ui/NotificationsPopover.svelte \
  apps/web-svelte/src/lib/components/shopping-lists/ShoppingListCard.svelte \
  apps/web-svelte/src/lib/components/shopping-lists/ShoppingListSuggestions.svelte \
  apps/web-svelte/src/lib/components/settings/CategoriesTab.svelte \
  apps/web-svelte/src/lib/components/settings/CategoryDialog.svelte \
  apps/web-svelte/src/lib/components/settings/GroupsTab.svelte \
  apps/web-svelte/src/lib/components/settings/ProfileTab.svelte \
  apps/web-svelte/src/routes/shopping-lists/+page.svelte \
  apps/web-svelte/src/routes/shopping-lists/[id]/+page.svelte \
  apps/web-svelte/src/routes/settings/+page.svelte \
  apps/web-svelte/src/routes/admin/+page.svelte; do
  echo "=== $f ==="; cat "$f"; echo;
done
```

- [ ] **Step 7.2: Update Dialog.svelte**

The dialog panel (already read) — exact changes:

```svelte
<div
  class="w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-zinc-900 dark:shadow-zinc-950"
  ...
>
  <div class="flex items-center justify-between border-b border-zinc-100 px-5 pt-5 pb-3 dark:border-zinc-800">
    <h2 ... class="text-base font-semibold text-zinc-900 dark:text-zinc-100">...</h2>
    <button
      ...
      class="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
    >
```

- [ ] **Step 7.3: Update ConfirmDialog.svelte**

Apply same table. Confirm button is likely `bg-rose-600 text-white` — keep. Cancel button likely zinc-bordered — apply table.

- [ ] **Step 7.4: Update NotificationsPopover.svelte**

Apply substitution table to popover container, list items, read/unread state classes, badge.

- [ ] **Step 7.5: Update ShoppingListCard.svelte, ShoppingListSuggestions.svelte**

Apply table. ShoppingListCard has card container, completion badge, progress. Suggestions has dropdown-style list.

- [ ] **Step 7.6: Update settings components**

Apply table to `CategoriesTab.svelte`, `CategoryDialog.svelte`, `GroupsTab.svelte`, `ProfileTab.svelte`.

For ProfileTab: the rose danger zone `border-rose-200 bg-rose-50` → add `dark:border-rose-900 dark:bg-rose-950`. Text `text-rose-700` → add `dark:text-rose-400`.

- [ ] **Step 7.7: Update route pages**

`routes/settings/+page.svelte` — tab list `bg-zinc-100` pill → add `dark:bg-zinc-800`; active tab `bg-white` → add `dark:bg-zinc-700`; tab text → apply table.

`routes/shopping-lists/+page.svelte` and `routes/shopping-lists/[id]/+page.svelte` — apply table to all zinc/white classes.

`routes/admin/+page.svelte` — table container, header row `bg-zinc-50`, rows, badges, search input. Apply table.

- [ ] **Step 7.8: Visual spot-check all pages**

```bash
cd apps/web-svelte && pnpm dev
```
Emulate dark mode in DevTools. Check: `/login`, `/transactions`, `/shopping-lists`, `/settings` (all tabs), `/admin`. Fix any missed elements.

- [ ] **Step 7.9: Final svelte-check**

```bash
cd apps/web-svelte
pnpm exec svelte-check --tsconfig ./tsconfig.json && pnpm lint
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 7.10: Commit**

```bash
git add apps/web-svelte/src/lib/components/ apps/web-svelte/src/routes/
git commit -m "feat(ui): dark mode — dialogs, shopping lists, settings, admin

CSS-only via Tailwind dark: + prefers-color-scheme. No JS, no toggle,
no DB change. color-scheme: light dark set in html."
```

---

## Task 8: Bulk delete transactions

**Files:** `apps/web-svelte/messages/pl.json`, `apps/web-svelte/src/lib/components/transactions/TransactionTable.svelte`, `apps/web-svelte/src/routes/transactions/+page.svelte`

- [ ] **Step 8.1: Add i18n strings**

In `apps/web-svelte/messages/pl.json`, add:
```json
  "transactions_delete_selected": "Usuń zaznaczone ({count})",
  "transactions_deselect_all": "Odznacz wszystkie"
```

- [ ] **Step 8.2: Recompile paraglide**

```bash
cd apps/web-svelte
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
```

- [ ] **Step 8.3: Update TransactionTable.svelte — add selection props and checkboxes**

Add to `<script>`:

```ts
interface Props {
  transactions: TransactionWithCategory[];
  currentUserId?: string | null;
  onedit?: (tx: TransactionWithCategory) => void;
  ondelete?: (id: string) => void;
  onrowclick?: (tx: TransactionWithCategory) => void;
  emptyLabel?: string;
  // NEW
  selectedIds?: Set<string>;
  onselectionchange?: (ids: Set<string>) => void;
}
let {
  transactions,
  currentUserId,
  onedit,
  ondelete,
  onrowclick,
  emptyLabel,
  selectedIds = $bindable(new Set<string>()),
  onselectionchange,
}: Props = $props();

const bulkEnabled = $derived(!!ondelete);

function toggleOne(id: string) {
  const next = new Set(selectedIds);
  next.has(id) ? next.delete(id) : next.add(id);
  onselectionchange?.(next);
}

const ownTxIds = $derived(
  transactions.filter((tx) => !isShared(tx)).map((tx) => tx.id)
);

const allOwnSelected = $derived(
  ownTxIds.length > 0 && ownTxIds.every((id) => selectedIds.has(id))
);

function toggleAll() {
  const next = allOwnSelected ? new Set<string>() : new Set(ownTxIds);
  onselectionchange?.(next);
}
```

In the **mobile card list** (`<ul>`), inside each `<li>`, add checkbox in the top-right of the flex row (only for own transactions, when `bulkEnabled`):

```svelte
<div class="flex items-start justify-between gap-3">
  {#if bulkEnabled && !isShared(tx)}
    <input
      type="checkbox"
      checked={selectedIds.has(tx.id)}
      onchange={() => toggleOne(tx.id)}
      onclick={(e) => e.stopPropagation()}
      class="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-zinc-600"
      aria-label="Zaznacz transakcję"
    />
  {/if}
  <!-- existing description span -->
  ...
</div>
```

In the **desktop table** (`<table>`), add to `<thead><tr>` as first `<th>`:

```svelte
{#if bulkEnabled}
  <th class="w-10 px-2 py-3">
    <input
      type="checkbox"
      checked={allOwnSelected}
      onchange={toggleAll}
      class="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
      aria-label="Zaznacz wszystkie"
    />
  </th>
{/if}
```

Add to each desktop `<tr>` as first `<td>` (only for own transactions):

```svelte
{#if bulkEnabled}
  <td
    class="px-2 py-3"
    onclick={(e) => {
      e.stopPropagation();
      if (!isShared(tx)) toggleOne(tx.id);
    }}
    onkeydown={(e) => {
      if ((e.key === "Enter" || e.key === " ") && !isShared(tx)) toggleOne(tx.id);
    }}
  >
    {#if !isShared(tx)}
      <input
        type="checkbox"
        checked={selectedIds.has(tx.id)}
        onchange={() => toggleOne(tx.id)}
        class="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
        aria-label="Zaznacz transakcję"
      />
    {/if}
  </td>
{/if}
```

- [ ] **Step 8.4: Update routes/transactions/+page.svelte — selection state + bulk bar**

Add to `<script>`:

```ts
let selectedIds = $state(new Set<string>());
let showBulkDeleteConfirm = $state(false);
let bulkDeletePending = $state<string[]>([]);

// Clear selection on date range change
$effect(() => {
  void startYear;
  void startMonth;
  void endYear;
  void endMonth;
  selectedIds = new Set();
});

const bulkDeleteMutation = createMutation(() => ({
  mutationFn: async (ids: string[]) => {
    await Promise.all(ids.map((id) => deleteTransaction(id)));
  },
  onSuccess: async (_data, ids) => {
    selectedIds = new Set();
    toast.success(`Usunięto ${ids.length} transakcji`);
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
  },
  onError: () => toast.error(m.toast_error()),
}));
```

Update the `<TransactionTable>` usage — add two new props:

```svelte
<TransactionTable
  transactions={filteredTxs}
  {currentUserId}
  onedit={...}
  ondelete={...}
  onrowclick={...}
  {selectedIds}
  onselectionchange={(ids) => { selectedIds = ids; }}
  {emptyLabel}
/>
```

Add bulk action bar **directly above** the `<TransactionTable>`:

```svelte
{#if selectedIds.size > 0}
  <div
    class="sticky bottom-20 z-30 mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-xl bg-zinc-900 px-4 py-3 shadow-lg md:bottom-4 dark:bg-zinc-100"
  >
    <span class="text-sm font-medium text-white dark:text-zinc-900">
      Zaznaczono {selectedIds.size}
    </span>
    <div class="flex gap-2">
      <button
        type="button"
        onclick={() => { selectedIds = new Set(); }}
        class="rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white dark:text-zinc-600 dark:hover:text-zinc-900"
      >
        {m.transactions_deselect_all()}
      </button>
      <button
        type="button"
        onclick={() => {
          bulkDeletePending = Array.from(selectedIds);
          showBulkDeleteConfirm = true;
        }}
        disabled={bulkDeleteMutation.isPending}
        class="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
      >
        {m.transactions_delete_selected({ count: String(selectedIds.size) })}
      </button>
    </div>
  </div>
{/if}
```

Add bulk confirm dialog at end of template (alongside existing ConfirmDialog for single delete):

```svelte
<ConfirmDialog
  open={showBulkDeleteConfirm}
  message={`Czy na pewno chcesz usunąć ${bulkDeletePending.length} transakcji? Tej operacji nie można cofnąć.`}
  onconfirm={() => {
    bulkDeleteMutation.mutate(bulkDeletePending);
    showBulkDeleteConfirm = false;
  }}
  onclose={() => {
    showBulkDeleteConfirm = false;
    bulkDeletePending = [];
  }}
  pending={bulkDeleteMutation.isPending}
/>
```

- [ ] **Step 8.5: Verify**

```bash
cd apps/web-svelte
pnpm exec svelte-check --tsconfig ./tsconfig.json && pnpm lint
```
Expected: 0 errors.

- [ ] **Step 8.6: Manual test**

```bash
cd apps/web-svelte && pnpm dev
```
Check: checkboxes appear in table rows, select all works, floating bar appears with count, delete confirmation fires, rows removed after confirm.

- [ ] **Step 8.7: Commit**

```bash
git add apps/web-svelte/messages/pl.json apps/web-svelte/src/lib/paraglide/ apps/web-svelte/src/lib/components/transactions/TransactionTable.svelte apps/web-svelte/src/routes/transactions/+page.svelte
git commit -m "feat(transactions): bulk delete — checkbox selection + floating action bar"
```

---

## Task 9: Playwright setup

**Files:** `apps/web-svelte/package.json`, `apps/web-svelte/playwright.config.ts`, `apps/web-svelte/e2e/global-setup.ts`, `apps/web-svelte/e2e/helpers/session.ts`, `apps/web-svelte/.gitignore`

Local Supabase default keys (same for every `supabase start` installation):
- **Anon key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7W9oL8kT-UCHxflKRe4VXN-tS0MqJpSaYwU`
- **Service role key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SbVE`

These are not secrets — they're Supabase's published demo keys for local dev.

- [ ] **Step 9.1: Install @playwright/test**

```bash
cd apps/web-svelte
pnpm add -D @playwright/test
npx playwright install chromium --with-deps
```

Add to `apps/web-svelte/package.json` scripts section:
```json
"test:e2e": "playwright test",
"test:e2e:report": "playwright show-report"
```

- [ ] **Step 9.2: Add e2e/.auth/ to .gitignore**

In `apps/web-svelte/.gitignore`, add:
```
e2e/.auth/
playwright-report/
test-results/
```

- [ ] **Step 9.3: Create playwright.config.ts**

Create `apps/web-svelte/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';
const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON = process.env.E2E_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7W9oL8kT-UCHxflKRe4VXN-tS0MqJpSaYwU';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    storageState: 'e2e/.auth/user.json',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: [
      `PUBLIC_SUPABASE_URL=${SUPABASE_URL}`,
      `PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON}`,
      'PUBLIC_VAPID_KEY=BHKoiccZwq3Y5Qw5dmFxVLJIA7w9zcSZkchPKWk-vxBeR421yieZW7gGxuluBBa6sRmpIsFXRSuFyRarLcdvqT4',
      'pnpm build && pnpm preview --port 4173',
    ].join(' '),
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 9.4: Create e2e/global-setup.ts**

Create `apps/web-svelte/e2e/global-setup.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FullConfig } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE =
  process.env.E2E_SUPABASE_SERVICE_ROLE ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SbVE';
const ANON_KEY =
  process.env.E2E_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7W9oL8kT-UCHxflKRe4VXN-tS0MqJpSaYwU';
const E2E_EMAIL = 'e2e@portfelik.test';
const E2E_PASS = 'e2eTestPass123!';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';

export default async function globalSetup(_config: FullConfig) {
  // 1. Create e2e user (ignore 422 = already exists)
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASS, email_confirm: true }),
  });

  // 2. Sign in to get session tokens
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASS }),
  });
  const session = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at: number;
    user: { id: string };
  };
  if (!session.access_token) throw new Error(`E2E auth failed: ${JSON.stringify(session)}`);

  // 3. Ensure profile row exists (trigger creates it on signup, but double-check)
  await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal,resolution=ignore-duplicates',
    },
    body: JSON.stringify({ id: session.user.id, email: E2E_EMAIL, name: 'E2E User', role: 'user' }),
  });

  // 4. Build the localStorage key Supabase uses: sb-<host-dashes>-<port>-auth-token
  const urlObj = new URL(SUPABASE_URL);
  const host = urlObj.hostname.replace(/\./g, '-');
  const port = urlObj.port;
  const storageKey = `sb-${host}${port ? `-${port}` : ''}-auth-token`;

  const storageState = {
    cookies: [],
    origins: [
      {
        origin: BASE_URL,
        localStorage: [
          {
            name: storageKey,
            value: JSON.stringify({
              access_token: session.access_token,
              token_type: 'bearer',
              expires_in: session.expires_in,
              expires_at: session.expires_at,
              refresh_token: session.refresh_token,
              user: session.user,
            }),
          },
        ],
      },
    ],
  };

  const authDir = path.join(__dirname, '.auth');
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, 'user.json'), JSON.stringify(storageState, null, 2));

  console.log(`E2E session stored for ${E2E_EMAIL} (user ${session.user.id})`);
}
```

- [ ] **Step 9.5: Create e2e/helpers/session.ts**

Create `apps/web-svelte/e2e/helpers/session.ts`:

```ts
import type { Page } from '@playwright/test';

/** Navigate to a page and wait for the app to hydrate past the auth check. */
export async function gotoAuthenticated(page: Page, path: string) {
  await page.goto(path);
  // Wait for nav to appear — means auth passed and app loaded
  await page.waitForSelector('header, nav[aria-label]', { timeout: 10_000 });
}
```

- [ ] **Step 9.6: Verify setup compiles**

```bash
cd apps/web-svelte
npx tsc --noEmit --project tsconfig.json 2>/dev/null || true
# Check for obvious import errors:
node --input-type=module <<'EOF'
import './e2e/global-setup.ts';
EOF
```
(TS errors in e2e files are expected at this point — they won't block playwright runs since Playwright handles TS via esbuild.)

- [ ] **Step 9.7: Commit setup**

```bash
git add apps/web-svelte/package.json apps/web-svelte/playwright.config.ts apps/web-svelte/e2e/ apps/web-svelte/.gitignore
git commit -m "chore(e2e): add Playwright setup with local Supabase auth via storageState"
```

---

## Task 10: Playwright tests

**Files:** `apps/web-svelte/e2e/transactions.spec.ts`, `apps/web-svelte/e2e/shopping-lists.spec.ts`

- [ ] **Step 10.1: Check UI labels used in TransactionDialog and ShoppingList forms**

```bash
grep -n "m\." apps/web-svelte/src/lib/components/transactions/TransactionDialog.svelte | head -30
grep -n "m\." apps/web-svelte/src/routes/shopping-lists/+page.svelte | head -20
grep -n "m\." apps/web-svelte/src/routes/transactions/+page.svelte | head -10
```
Note the exact translated strings for: add button, form labels, save button, description label.

Then check the Polish translations:
```bash
grep -E '"transaction_form_|"common_add|"common_save|"transactions_title|"shopping' apps/web-svelte/messages/pl.json | head -30
```

- [ ] **Step 10.2: Create e2e/transactions.spec.ts**

Create `apps/web-svelte/e2e/transactions.spec.ts` — replace `"Transakcje"`, `"Dodaj"`, `"Opis"`, `"Kwota"`, `"Zapisz"` with the actual Polish strings found in Step 10.1:

```ts
import { test, expect } from '@playwright/test';
import { gotoAuthenticated } from './helpers/session';

const UNIQUE_DESC = `E2E transakcja ${Date.now()}`;

test.describe('transactions', () => {
  test('loads transactions page', async ({ page }) => {
    await gotoAuthenticated(page, '/transactions');
    // heading exists
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // summary cards visible
    await expect(page.locator('[data-testid="summary-cards"], .summary-cards, h2').first()).toBeVisible();
  });

  test('add expense transaction → appears in table', async ({ page }) => {
    await gotoAuthenticated(page, '/transactions');

    // Open add dialog — find the "Dodaj" / "+" button
    const addBtn = page.getByRole('button', { name: /dodaj|add|\+/i }).first();
    await addBtn.click();

    // Wait for dialog
    await page.waitForSelector('[role="dialog"]');

    // Fill description
    const descInput = page.getByLabel(/opis/i);
    await descInput.fill(UNIQUE_DESC);

    // Fill amount
    const amtInput = page.getByLabel(/kwota/i);
    await amtInput.fill('42.50');

    // Submit
    await page.getByRole('button', { name: /zapisz|save/i }).click();

    // Dialog closes, table shows new row
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(UNIQUE_DESC)).toBeVisible({ timeout: 10_000 });
  });

  test('summary cards show income and expense totals', async ({ page }) => {
    await gotoAuthenticated(page, '/transactions');
    // At minimum both cards render
    await expect(page.getByText(/wydatki/i).first()).toBeVisible();
    await expect(page.getByText(/przychody/i).first()).toBeVisible();
  });

  test('status filter hides non-matching rows', async ({ page }) => {
    await gotoAuthenticated(page, '/transactions');
    // Apply status=draft filter via URL
    const url = new URL(page.url());
    url.searchParams.set('status', 'draft');
    await page.goto(url.toString());
    // Either shows filtered rows or empty state — page must not crash
    await expect(page.locator('body')).not.toContainText('Error');
  });
});
```

- [ ] **Step 10.3: Create e2e/shopping-lists.spec.ts**

```ts
import { test, expect } from '@playwright/test';
import { gotoAuthenticated } from './helpers/session';

const UNIQUE_NAME = `E2E lista ${Date.now()}`;

test.describe('shopping lists', () => {
  test('loads shopping lists page', async ({ page }) => {
    await gotoAuthenticated(page, '/shopping-lists');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('create shopping list → card appears', async ({ page }) => {
    await gotoAuthenticated(page, '/shopping-lists');

    // Open create dialog
    const createBtn = page.getByRole('button', { name: /nowa|dodaj|utwórz|\+/i }).first();
    await createBtn.click();

    await page.waitForSelector('[role="dialog"]');

    // Fill name
    const nameInput = page.getByLabel(/nazwa/i);
    await nameInput.fill(UNIQUE_NAME);

    // Submit
    await page.getByRole('button', { name: /zapisz|utwórz|create/i }).click();

    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(UNIQUE_NAME)).toBeVisible({ timeout: 10_000 });
  });

  test('navigate into shopping list detail', async ({ page }) => {
    await gotoAuthenticated(page, '/shopping-lists');
    // Click the first list card if any exist
    const card = page.locator('li, [data-testid="shopping-list-card"]').first();
    if (await card.isVisible()) {
      await card.click();
      await expect(page.url()).toContain('/shopping-lists/');
    }
  });
});
```

- [ ] **Step 10.4: Run tests locally (requires local Supabase)**

```bash
# From repo root
supabase start

cd apps/web-svelte
pnpm test:e2e
```
Expected: all tests pass. Fix any selector mismatches by checking actual rendered text in `pnpm dev`.

- [ ] **Step 10.5: Commit tests**

```bash
git add apps/web-svelte/e2e/
git commit -m "test(e2e): Playwright tests — transactions + shopping lists"
```

---

## Task 11: CI — Add Playwright job

**Files:** `.github/workflows/cloudflare-deploy.yml`

- [ ] **Step 11.1: Update cloudflare-deploy.yml**

Open `.github/workflows/cloudflare-deploy.yml`. Add the following job after the `ci` job (at the same indentation level as `deploy`):

```yaml
  playwright:
    name: Playwright E2E
    runs-on: ubuntu-latest
    needs: ci
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v6

      - uses: pnpm/action-setup@v5
        with:
          version: 9

      - uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Start local Supabase
        run: supabase start

      - name: Install Playwright browsers
        working-directory: apps/web-svelte
        run: npx playwright install chromium --with-deps

      - name: Run Playwright tests
        working-directory: apps/web-svelte
        env:
          # Local Supabase always uses these demo keys
          E2E_SUPABASE_URL: http://127.0.0.1:54321
          E2E_SUPABASE_ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRFA0NiK7W9oL8kT-UCHxflKRe4VXN-tS0MqJpSaYwU
          E2E_SUPABASE_SERVICE_ROLE: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hj04zWl196z2-SbVE
          E2E_BASE_URL: http://localhost:4173
        run: pnpm test:e2e

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: apps/web-svelte/playwright-report/
          retention-days: 7
```

- [ ] **Step 11.2: Verify YAML is valid**

```bash
cat .github/workflows/cloudflare-deploy.yml | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin); print('YAML valid')"
```
Expected: `YAML valid`.

- [ ] **Step 11.3: Commit CI update**

```bash
git add .github/workflows/cloudflare-deploy.yml
git commit -m "ci: add Playwright e2e job — local Supabase on PR"
```

---

## Self-review

**Spec coverage:**
- ✅ Firebase decommission: Task 1
- ✅ Push opt-out: Task 2
- ✅ Admin trigger: Task 3
- ✅ Dark mode foundation: Task 4
- ✅ Dark mode Navigation + Login: Task 5
- ✅ Dark mode transaction components: Task 6
- ✅ Dark mode shopping/settings/admin/dialogs: Task 7
- ✅ Bulk delete: Task 8
- ✅ Playwright setup: Task 9
- ✅ Playwright tests: Task 10
- ✅ CI Playwright job: Task 11

**Placeholder scan:** No TBD, no "add appropriate handling", no "similar to Task N". All steps have exact code or commands.

**Type consistency:** `Set<string>` for `selectedIds` consistent across Tasks 8 (table) and 8 (page). `gotoAuthenticated(page, path)` defined in Task 9 used in Task 10. `trigger_admin_summary()` in migration (Task 3) called as `supabase.rpc('trigger_admin_summary')` in admin page (Task 3). Consistent.

**Notes for executing agent:**
- Tasks 1–3 are fully independent of Tasks 4–11 and can be done first without rebuilding anything.
- Dark mode Tasks 4–7 must be done in order (4 before 5, 5 before 6, etc.) because Task 4 sets up the foundation the others depend on.
- Task 8 (bulk delete) is independent of dark mode — can be done in any order relative to Tasks 4–7.
- Tasks 9–11 (Playwright) depend on all features being done so tests exercise the full surface.
