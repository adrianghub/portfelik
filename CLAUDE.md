# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Agent Workflow Rules

These rules apply to every task. Follow them regardless of phase or instruction scope.

### After every change
1. **Sanity check** — run `pnpm exec svelte-check --tsconfig ./tsconfig.json` (from `apps/web-svelte/`). Must exit with 0 errors, 0 warnings.
2. **Security audit** — scan modified files for accidental exposure: API keys, JWTs, secrets, hardcoded credentials. Run: `grep -rE "(eyJ[a-zA-Z0-9_-]{20,}|sb_secret_|PRIVATE|password\s*=)" <changed files>`. Flag anything found before proceeding.
3. **Relevant validation** — if schema changed: verify RLS enabled on new tables; if Edge Functions changed: verify verify_jwt setting matches intent; if migrations changed: confirm idempotent naming.

### Before finalising a task
4. **Paraglide recompile** if `messages/pl.json` was touched: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide` (from `apps/web-svelte/`).
5. **Prepare commit list** — output: (a) ordered list of commit messages (Conventional Commits format), (b) exact file list for each commit. User commits manually.

### After each increment
6. **Update knowledge base** — update `CLAUDE.md` phase status table + relevant sections to reflect what changed. Update memory files at `~/.claude/projects/.../memory/` (project_state.md at minimum). Stale docs are worse than no docs.
7. **Update handoff notes** — rewrite the "Immediate next step" line at top of CLAUDE.md. Add any new gotchas discovered. Next agent must be able to start cold from CLAUDE.md alone.

### Increment discipline
- Keep each increment small enough to audit in one pass. Split by concern: schema / services / components / config. Do not bundle unrelated changes.
- One migration file per logical schema change. Never amend applied migrations.

---

## Project Status — Active Migration

**Portfelik** is a personal-finance PWA currently being rewritten from **React 19 + Firebase** to **SvelteKit + Supabase**. The full plan is in `MIGRATION_PLAN.md`. Read that file first before starting any phase.

### Current position in the migration

| Phase | Status | Notes |
|---|---|---|
| 0 — Baseline & safety net | ✅ Done | `firestore.rules` audited, `MIGRATION_PLAN.md` committed |
| 1 — Supabase schema | ✅ Done | Local stack running; migration applied cleanly. Two RLS recursion hotfixes applied 2026-04-24 |
| 2 — Data migration script | ⬜ Not started | `tools/migrate/` Node script. Open question: real historical-data migration or fresh start |
| 3 — SvelteKit skeleton | ✅ Done | Google OAuth login verified on staging (`dev.portfelik.pages.dev`) |
| 4 — Read-only feature parity | ✅ Done | All read screens ported: transactions+filters+summary, categories, groups, shopping lists, admin (role-gated) |
| 5 — Mutations + Cloud Functions + push | 🟡 In progress | 5.1 ✅ 5.2 ✅ 5.3 ✅ 5.4 ✅ 5.5 SW+push ✅ — 5.6 CSV next |
| 6 — Offline queue (Dexie outbox) | ⬜ Not started | Optional |
| 7 — Cutover | 🟡 DNS already flipped | `portfelik.adrianzinko.com` CNAME → `dev.portfelik.pages.dev` (Cloudflare proxied). **Production already serves the Phase 4 read-only build.** Firebase Hosting decommission + Firestore freeze pending Phase 5 close-out |
| 8 — Hardening + e2e | ⬜ Not started | Playwright |

**Immediate next step (Phase 5.6):** CSV import/export. See Phase 5.6 section below.

### Phase 5 scope decisions (2026-04-25)
- **Go BFF (`portfelik-bff/`)**: retire fully — Svelte calls Supabase directly. Delete in Phase 5.7 final PR.
- **Push notifications**: bundled with Phase 5 (VAPID + `push_subscriptions` table + Edge Functions).
- **CSV import/export**: included in Phase 5 (cutover regression risk if dropped).
- **Recurring + status cron**: pure SQL `pg_cron`. No Edge Function indirection.
- **Schema additions needed**: `notifications` and `push_subscriptions` tables (not in initial migration).
- **PR slicing**: 5.1 schema → 5.2 Edge Functions → 5.3 service writes → 5.4 forms → 5.5 SW+push → 5.6 CSV → 5.7 BFF deletion.

### Phase 5.3 done (2026-04-25)
- `services/transactions.ts` — `createTransaction`, `updateTransaction`, `deleteTransaction`. Amount always `Math.abs`. `user_id` fetched from `supabase.auth.getUser()` inside fn (see gotcha below).
- `services/categories.ts` — `createCategory`, `updateCategory`, `deleteCategory`.
- `services/groups.ts` — all SECURITY DEFINER RPCs: `createGroup`, `disbandGroup`, `leaveGroup`, `inviteUser`, `acceptInvitation`, `rejectInvitation`, `cancelInvitation`. Also `fetchGroupMembers`, `fetchReceivedInvitations`, `fetchSentInvitations`.
- `services/shopping-lists.ts` — `createShoppingList`, `updateShoppingList`, `deleteShoppingList`, `completeShoppingList` (RPC, returns linked transaction), item CRUD.
- `services/profiles.ts` — `updateProfile` (name only; role change blocked by `REVOKE UPDATE`).
- `lib/types.ts` — added `GroupInvitation` interface.

### Phase 5.4 done (2026-04-25)
- `lib/components/ui/Dialog.svelte` — reusable modal base (backdrop click + Escape closes)
- `lib/components/ui/ConfirmDialog.svelte` — destructive-action confirm
- `lib/components/transactions/TransactionDialog.svelte` — create/edit, type toggle, all fields, recurring
- `lib/components/settings/CategoryDialog.svelte` — create/edit
- `lib/components/settings/CategoriesTab.svelte` — rewritten with add/edit/delete (system cats read-only)
- `lib/components/settings/GroupsTab.svelte` — rewritten: create group, invite, disband, leave, accept/reject invitations
- `lib/components/settings/ProfileTab.svelte` — rewritten with inline name edit
- `routes/transactions/+page.svelte` — "+" button, edit/delete per-row
- `routes/shopping-lists/+page.svelte` — create list dialog, delete per-card
- `routes/shopping-lists/[id]/+page.svelte` — toggle items, add/delete items, complete list → transaction
- `messages/pl.json` — 40+ new i18n keys; requires recompile after every change (see gotcha below)

### Phase 5.5 done (2026-04-26)
- `apps/web-svelte/static/sw.js` — push + notificationclick handler, basic asset caching. No VitePWA plugin — static file served at `/sw.js` by `adapter-static`. `group_invitation` notification type opens `/settings?tab=groups`.
- `apps/web-svelte/src/lib/services/push.ts` — `registerServiceWorker()`, `subscribeToPush(userId)`, `unsubscribeFromPush()`. Checks existing subscription before creating new (idempotent). Upserts to `push_subscriptions` table.
- `+layout.svelte` — wired: `registerServiceWorker` + `subscribeToPush` on mount (if session exists) and on `SIGNED_IN`; `unsubscribeFromPush` on `SIGNED_OUT`.
- `PUBLIC_VAPID_KEY` added to `.env.local` and to `.github/workflows/cloudflare-deploy.yml` build env (needs GitHub secret added too — see pending manual steps).
- All 15 svelte-check warnings cleared: `untrack()` in `$state()` dialog initializers, `role="presentation"` on backdrop divs, `svelte-ignore a11y_autofocus` on ProfileTab input.
- Trigger functions migrated from GUC → Supabase Vault (see security section below).

### Security fixes done (2026-04-26)
- **Supabase Vault replaces GUC for `service_role_key`**: `ALTER DATABASE SET "app.settings.service_role_key"` is blocked by Supabase platform (no superuser) and would expose the key via `current_setting()` to any `authenticated` user. Triggers now read from `vault.decrypted_secrets` (RLS-protected, encrypted at rest). Migration `20260425000001_phase5_2_edge_function_hooks.sql` updated accordingly.
- **`_setting()` helper revoked**: `REVOKE EXECUTE ON FUNCTION public._setting(text) FROM authenticated, anon` applied via migration.
- **`functions_url` hardcoded**: `'https://emqzcygfwcvbmhxhfkcc.supabase.co/functions/v1'` is in trigger function bodies — not a secret, no config needed.

### Pending manual steps before push works end-to-end
✅ Legacy JWT API keys disabled (old service_role JWT invalidated)
✅ `PUBLIC_SUPABASE_ANON_KEY` GitHub secret updated to `sb_publishable_` format
✅ `PUBLIC_VAPID_KEY` GitHub secret set with new keypair
✅ VAPID keypair regenerated (`npx web-push generate-vapid-keys`)

Still required:
1. **INTERNAL_TRIGGER_SECRET** — generate: `openssl rand -hex 32`
   - Set as Edge Function secret: Dashboard → Edge Functions → Secrets → `INTERNAL_TRIGGER_SECRET=<hex>`
   - Insert into Vault: `select vault.create_secret('<hex>', 'internal_trigger_secret');`
2. **VAPID Edge Function secrets** — Dashboard → Edge Functions → Secrets:
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:zinko.adrian00@gmail.com`

### Phase 5.6 — CSV import/export (next)
- **Export**: `GET /api/transactions/export?year=YYYY&month=M` — query via PostgREST, format as CSV in browser (no server needed, `adapter-static`). Trigger download via `URL.createObjectURL`.
- **Import**: file input → parse CSV in browser → validate rows → batch insert via `services/transactions.ts`. Match categories by name (case-insensitive). Skip rows with unknown categories (report errors to user).
- Reference format: check the React app's existing export shape in `src/modules/transactions/` before designing the CSV schema.

### Gotchas for future agents (hard-won — read before Phase 5.5+)

1. **`createMutation` is NOT a Svelte store.** In `@tanstack/svelte-query` v6, `createQuery()` returns a store-compatible object (use `query.data` directly — reactive via runes). `createMutation()` returns a plain reactive object with NO `.subscribe` — never use `$mutation.xxx` syntax. Always: `mutation.mutate(...)`, `mutation.isPending`, `mutation.isError`.

2. **Paraglide requires manual recompile after every pl.json edit.** The Vite plugin handles dev-time HMR, but `svelte-check` / `tsc` see the old generated file until you run: `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide` from `apps/web-svelte/`.

3. **PostgREST insert types require ALL NOT NULL columns.** Supabase-generated TypeScript types treat `user_id` as required on insert even though RLS will reject unauthorized writes. Pass `user_id: user.id` explicitly — get it from `supabase.auth.getUser()` inside service functions. Do NOT assume RLS auto-sets it.

4. **`complete_shopping_list` RPC returns `transactions` row** (not void). It atomically marks the list completed AND creates a linked expense transaction. Invalidate both `shopping_list` and `transactions`/`summary` query keys on success.

5. **Group write operations are ALL SECURITY DEFINER RPCs.** Direct writes to `user_groups`, `group_members`, `group_invitations` are blocked by `using (false)` RLS policies. Always use the named RPCs in `services/groups.ts`.

6. **`$state()` initializer reading a prop triggers `state_referenced_locally` warning.** Svelte 5 warns when `$state(someprop?.value)` references a reactive prop — it only captures the initial value. Intentional one-time init pattern: wrap in `untrack(() => ...)`. The `$effect(() => { if (open) { reset fields } })` pattern handles re-sync when dialog reopens.

7. **`svelte-ignore` on a11y rules downgrades to WARNING, not silent.** svelte-check still reports them. Use correct semantics: `role="presentation"` on backdrop divs, proper ARIA on interactive elements. Only use `svelte-ignore a11y_autofocus` for genuinely intentional autofocus.

8. **`Uint8Array` type for VAPID key.** TypeScript infers `Uint8Array<ArrayBufferLike>` from `Uint8Array.from()`. `PushManager.subscribe({ applicationServerKey })` expects `Uint8Array<ArrayBuffer>`. Fix: allocate with `new ArrayBuffer(n)` + `new Uint8Array(buffer)` and declare return type explicitly as `Uint8Array<ArrayBuffer>`.

9. **Supabase MCP lacks `ALTER DATABASE SET` privilege.** Any `app.*` GUC changes via MCP fail with `permission denied`. Use `apply_migration` for DDL that needs elevated privileges. For secrets, use Supabase Vault (`vault.create_secret`) — it's a function call, no special privilege needed.

10. **Supabase Vault for trigger secrets.** Pattern: `select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1`. Must set `search_path = public, vault` on the SECURITY DEFINER function. Insert secret once: `select vault.create_secret('<jwt>', 'service_role_key')`. Update: `select vault.update_secret(id, '<new-jwt>') from vault.secrets where name = 'service_role_key'`.

### Phase 5.1 + 5.2 done (2026-04-25)
- New migrations: `20260425000000_phase5_notifications_push.sql`, `20260425000001_phase5_2_edge_function_hooks.sql` (both applied to cloud DB).
- Edge Functions deployed: `send-push`, `sync-user-role`, `send-admin-summary`.
- VAPID keypair regenerated 2026-04-26. Public key: `BHKoiccZwq3Y5Qw5dmFxVLJIA7w9zcSZkchPKWk-vxBeR421yieZW7gGxuluBBa6sRmpIsFXRSuFyRarLcdvqT4`. Private key kept out of repo (set as Edge Function secret `VAPID_PRIVATE_KEY`).

### Manual config required before Phase 5.5 push works end-to-end
See "Pending manual steps" section above — all four steps required.

GUC approach was abandoned (Supabase blocks `ALTER DATABASE SET` even in Dashboard SQL Editor). Vault is the replacement — see gotcha #10.

### Phase 4 — new files added
- `apps/web-svelte/src/lib/types.ts` — shared domain types
- `apps/web-svelte/src/lib/utils.ts` — `cn()`, `formatCurrency()`, `formatDate()`, `getMonthBounds()`, `monthName()`
- `apps/web-svelte/src/lib/services/` — `categories.ts`, `transactions.ts`, `shopping-lists.ts`, `profiles.ts`, `groups.ts`
- `apps/web-svelte/src/lib/components/Navigation.svelte` — desktop top bar + mobile bottom tabs
- `apps/web-svelte/src/lib/components/transactions/` — `MonthPicker`, `CategoryFilter`, `TransactionTable`, `SummaryCards`, `CategoryBreakdown`
- `apps/web-svelte/src/lib/components/settings/` — `CategoriesTab`, `GroupsTab`, `ProfileTab`
- `apps/web-svelte/src/lib/components/shopping-lists/` — `ShoppingListCard`
- `apps/web-svelte/src/routes/transactions/+page.svelte` — URL params: `?year=YYYY&month=M&categoryId=<uuid>`
- `apps/web-svelte/src/routes/settings/+page.svelte` — URL param: `?tab=categories|groups|profile`
- `apps/web-svelte/src/routes/shopping-lists/+page.svelte` + `[id]/+page.svelte`
- `apps/web-svelte/src/routes/admin/+page.svelte` — role-gated, redirects non-admins
- `apps/web-svelte/src/lib/supabase.types.ts` — generated from local stack (`supabase gen types`)

---

## Repository layout

```
portfelik/portfelik/          ← repo root (this file lives here)
├── apps/
│   └── web-svelte/           ← SvelteKit app (Phase 3+, active development)
│       ├── src/lib/supabase.ts        ← Supabase client singleton
│       ├── src/routes/login/          ← Auth UI (email+password + Google OAuth)
│       ├── src/routes/auth/callback/  ← OAuth redirect handler
│       ├── messages/pl.json           ← Paraglide i18n source (auth keys; expand in Phase 4)
│       └── project.inlang/            ← Paraglide project config
├── src/                      ← React 19 app (LEGACY — do not extend)
│   ├── modules/              ← feature modules (transactions, categories, groups, shopping-lists, notifications, admin, shared)
│   ├── lib/firebase/         ← Firebase SDK wrappers (offline queue in firestore.ts:60-299)
│   └── routes/               ← TanStack Router file-based routes
├── functions/src/            ← Firebase Cloud Functions (Node 22, europe-central2)
│   └── notifications/        ← FCM push logic — porting to Edge Functions in Phase 5
├── portfelik-bff/            ← Go BFF (Chi router) — RETIRING; summary math is the canonical reference
│   └── internal/repositories/transaction_repository.go   ← lines 173-326: summary math to port to Vitest
├── supabase/
│   ├── migrations/20260423000000_initial_schema.sql  ← single migration, all schema in one file
│   ├── seed.sql              ← 21 Polish-language system categories (user_id IS NULL)
│   ├── config.toml           ← local Supabase CLI config
│   ├── .env.example          ← Google OAuth secrets template (copy → supabase/.env)
│   └── .gitignore            ← gitignores supabase/.env
├── .env.local.example        ← SvelteKit env template (copy → .env.local)
├── MIGRATION_PLAN.md         ← authoritative phase-by-phase plan; read before each phase
├── firestore.rules           ← audited; every policy has a corresponding RLS policy in the migration
└── firestore.indexes.json    ← audited; all compound indexes translated to Postgres indexes
```

> **Do not add features to the React app in `src/`.** It is frozen pending cutover.

---

## Development commands

### React app (legacy — read-only reference only)

```bash
npm run dev            # Vite dev server (port 5173)
npm run build          # tsc + vite build
npm run lint           # ESLint
npm run test           # vitest run (single pass)
npm run test:watch     # vitest in watch mode
npm run test:ui        # vitest UI
```

### Supabase local stack

```bash
# From portfelik/portfelik/
supabase start          # starts local stack + applies migrations + seeds; use this, NOT supabase db reset, after a failed start
supabase stop           # stops containers
supabase db reset       # wipes + replays migrations + seed (containers must be running)
supabase status         # prints local URLs + anon key (copy anon key → .env.local)
supabase gen types typescript --local > src/lib/supabase.types.ts   # regenerate types after schema changes
```

Copy `.env.local.example` → `.env.local` and paste the anon key from `supabase status` output.
Copy `supabase/.env.example` → `supabase/.env` and fill in Google OAuth credentials.

---

## Schema design — key decisions

The migration is **one file**: `supabase/migrations/20260423000000_initial_schema.sql`. It is structured in numbered sections:

1. Extensions (`pgcrypto`, `pg_cron`)
2. ENUM types (`user_role`, `transaction_type`, `transaction_status`, `shopping_list_status`, `invitation_status`)
3. `handle_updated_at()` trigger function *(only function safe to define before tables)*
4. Table definitions (FK dependency order)
5. Auth triggers (`handle_new_user` on `auth.users` insert → `profiles` row)
5.5. `is_admin()` and `is_group_member()` helpers *(must be after tables — LANGUAGE SQL validates references at creation time)*
6. RLS policies (28 policies across all tables)
7. Indexes
8. Domain RPCs (12 SECURITY DEFINER functions for all group operations)
9. `get_monthly_summary` RPC (SECURITY INVOKER — RLS applies transparently)
10. Views (`transactions_with_category`, `shopping_lists_with_items`)
11. Grants (to `authenticated`)
12. Realtime publication (`shopping_list_items`)

**Critical ordering rule:** `LANGUAGE SQL` functions in Postgres validate table references at parse time. Any function that queries a table must be defined *after* that table. `LANGUAGE plpgsql` functions are exempt (validated at runtime). This is why `is_admin()` and `is_group_member()` are in Section 5.5, not Section 3.

**Money:** `numeric(12,2)`, always stored as a positive magnitude. `type` enum (`income`/`expense`) carries the sign. The React app already normalises this with `Math.abs()` on write (verified at `TransactionForm.tsx:117`).

**System categories:** `user_id IS NULL` — visible to all authenticated users via RLS. Seeded in `supabase/seed.sql`.

**Group writes:** all go through `SECURITY DEFINER` RPCs (bypasses RLS for multi-table atomicity). Direct writes to `user_groups`, `group_members`, `group_invitations` are blocked by `using (false)` policies.

**Account deletion:** `delete_account()` RPC checks for owned groups first (FK is `RESTRICT`). User must transfer or disband groups before deletion.

**Shopping list items:** child table `shopping_list_items` (not jsonb) — enables partial updates and Realtime subscription.

**Soft deletes:** none. Hard deletes everywhere (KISS).

---

## RLS — how group sharing works

Transactions are visible to a user if:
- `user_id = auth.uid()` (own), OR
- the transaction owner shares any `group_members` group with the caller

The `usersShareGroup(a, b)` helper from `firestore.rules` becomes this SQL pattern (used in every group-scoped RLS policy):

```sql
exists (
  select 1 from group_members gm1
  join group_members gm2 on gm1.group_id = gm2.group_id
  where gm1.user_id = (select auth.uid())
    and gm2.user_id = transactions.user_id
)
```

All `auth.uid()` calls are wrapped in `(select auth.uid())` for the initPlan optimisation (Supabase lint rule `0003_auth_rls_initplan`) — this evaluates the function once per statement rather than once per row.

Admin role is checked via `is_admin()` (SECURITY DEFINER), which reads `profiles.role`. The `role` column is protected by `REVOKE UPDATE (role) ON profiles FROM authenticated` — it can only be changed via RPCs.

---

## Target SvelteKit architecture (Phase 3+)

The new app will be a **pure SPA** (`adapter-static`). Key choices and their consequences:

| Choice | Consequence |
|---|---|
| `adapter-static` | No SSR. Use `@supabase/supabase-js` base client. **Do NOT use `@supabase/ssr`** — that is for SSR/SSG. |
| Svelte 5 runes | Use `$state`, `$derived`, `$effect` — not stores. |
| TanStack Query v6 for Svelte | Options passed as functions (runes API). `import { createQuery, createMutation } from '@tanstack/svelte-query'`. |
| Paraglide v2 | Vite plugin only — **no adapter package**. Compile-time i18n, ~0 runtime KB. |
| shadcn-svelte | bits-ui based. Supports Svelte 5 + Tailwind v4. Data Table via TanStack Table. |

Supabase client singleton lives at `src/lib/supabase.ts`. Query client is provided in `+layout.svelte`.

Auth uses Google OAuth only (email/password sign-up disabled). Redirect URI for local dev: `http://127.0.0.1:54321/auth/v1/callback` (registered in Google Cloud Console → Authorized redirect URIs).

Service layer (to be added in Phase 3/4): `TransactionQueryService` / `TransactionCommandService` wrapping PostgREST calls. Named RPCs for business logic. This abstraction is the hook point for the future Dexie offline queue (Phase 6).

---

## Cloud Functions → Supabase replacements (Phase 5)

| Firebase function | Replacement |
|---|---|
| `processRecurringTransactions` (monthly cron) | `pg_cron` SQL job |
| `updateTransactionStatuses` (daily cron) | `pg_cron` SQL job |
| `sendAdminTransactionSummary` (weekly cron, FCM) | `pg_cron` → Edge Function `send-admin-summary` (VAPID web-push) |
| `onGroupInvitationCreated` (Firestore trigger, FCM) | Postgres `after insert` trigger → `pg_net.http_post` → Edge Function |
| `onUserRoleChanged` (Firestore trigger, custom claims) | Postgres trigger on `profiles.role` → Edge Function → `auth.admin.update_user_by_id` |

VAPID replaces FCM entirely. Existing FCM tokens are incompatible and are not migrated — users re-subscribe on first login to the SvelteKit app.

---

## Infrastructure

- **Local dev:** Supabase CLI stack (`supabase start` from repo root)
- **Supabase Cloud:** project ref `emqzcygfwcvbmhxhfkcc`, URL `https://emqzcygfwcvbmhxhfkcc.supabase.co`, publishable key in `supabase/.env` as `SUPABASE_ANON_KEY`. Schema + 21 seed categories already applied.
- **Cloudflare Pages:** project `portfelik`. Staging: `https://dev.portfelik.pages.dev` (Google OAuth verified working). Production domain `portfelik.adrianzinko.com` — DNS flip pending.
- **Deploy command** (from `apps/web-svelte/`): get URL + publishable key from Supabase dashboard → Settings → API
  ```bash
  PUBLIC_SUPABASE_URL=https://emqzcygfwcvbmhxhfkcc.supabase.co \
  PUBLIC_SUPABASE_ANON_KEY=<publishable key from Supabase dashboard> \
  pnpm build && npx wrangler pages deploy build --project-name portfelik --commit-dirty=true
  ```
- **Supabase MCP:** configured in `.mcp.json` at repo root (project ref `emqzcygfwcvbmhxhfkcc`). Authenticate via `mcp__supabase__authenticate` on session start.
- **Homelab (`bastion.local`, Pi 5 ARM64):** available via `ssh adrianzinko@bastion.local`. The bash sandbox cannot reach it (mDNS not resolvable in the sandbox) — any Pi commands must be run interactively by the user.

---

## Files to read before each phase

| Phase | Critical files |
|---|---|
| 1 (schema) | `supabase/migrations/20260423000000_initial_schema.sql`, `firestore.rules` |
| 2 (data migration) | `src/lib/firebase/firestore.ts:60-299`, `portfelik-bff/internal/repositories/transaction_repository.go:173-326` |
| 3 (SvelteKit skeleton) | `src/lib/service-worker.ts`, `public/sw.js`, `vite.config.ts:14-31` |
| 4 (feature parity) | `src/routes/` tree, `src/modules/transactions/hooks/useTransactionsQuery.ts` |
| 5 (mutations + push) | all files in `functions/src/` |
