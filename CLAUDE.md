# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Status — Active Migration

**Portfelik** is a personal-finance PWA currently being rewritten from **React 19 + Firebase** to **SvelteKit + Supabase**. The full plan is in `MIGRATION_PLAN.md`. Read that file first before starting any phase.

### Current position in the migration

| Phase | Status | Notes |
|---|---|---|
| 0 — Baseline & safety net | ✅ Done | `firestore.rules` audited, `MIGRATION_PLAN.md` committed |
| 1 — Supabase schema | ✅ Done | Local stack running; migration applied cleanly |
| 2 — Data migration script | ⬜ Not started | `tools/migrate/` Node script |
| 3 — SvelteKit skeleton | ✅ Done | Google OAuth login verified on staging (`dev.portfelik.pages.dev`) |
| 4 — Read-only feature parity | ✅ Done | All read screens ported: transactions+filters+summary, categories, groups, shopping lists, admin (role-gated) |
| 5–8 | ⬜ Not started | See `MIGRATION_PLAN.md` |

**Immediate next step (Phase 5):** Mutations + Cloud Functions replacements. Port create/update/delete for transactions, categories, groups, shopping lists. Generate VAPID keys + deploy Edge Functions.

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
