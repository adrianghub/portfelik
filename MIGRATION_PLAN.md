# Portfelik Migration Plan — React+Firebase → SvelteKit+Supabase

## Context

Portfelik is a personal-finance PWA (React 19 SPA + Firebase). The goal is to:

1. Rewrite the frontend in **SvelteKit** to simplify the stack, reduce bundle size, and remove the shadcn/ui→shadcn-svelte friction cost from future work.
2. Move the backend off Firebase. Candidate targets are **Supabase** (Postgres + Auth + Edge Functions) and/or the existing **`bastion-homelab` Raspberry Pi 5** (Docker Compose stack at `~/docker-hub/`, nginx + Cloudflare Tunnel + Certbot).
3. Retire the tiny Go BFF (`portfelik-bff`) whose only logic — group-share fan-out and monthly summary math — is trivially expressible as Postgres views + RLS policies.
4. Replace 4 Cloud Functions (scheduled jobs + 1 Firestore trigger + role claim sync) with Supabase primitives or Pi-hosted cron.

### Current surface area (verified)

**Frontend** — React 19 + Vite + TanStack Router + TanStack Query + shadcn/ui + Tailwind v4, VitePWA (`public/sw.js`), i18next (PL only), Firebase SDK 11. **No `onSnapshot` usage** — the app does not depend on Firestore realtime. Offline queue in `src/lib/firebase/firestore.ts:60-299` (Map of deferred ops flushed on `online` event).

**BFF (Go)** — Chi router, 3 read endpoints, group fan-out in `internal/repositories/transaction_repository.go:78-171`, summary math in `transaction_repository.go:173-326`. No Dockerfile, no tests.

**Cloud Functions (`functions/src/`)** — Node 22, `europe-central2`, `Europe/Warsaw`:
- `sendAdminTransactionSummary` — cron `0 8 * * 1`, aggregates prev-week txns per-user, pushes FCM + writes `notifications` row.
- `processRecurringTransactions` — cron `0 0 1 * *`, materializes recurring txn templates.
- `updateTransactionStatuses` — cron `0 6 * * *`, flips txn status by date.
- `onGroupInvitationCreated` — Firestore trigger on `group-invitations` create, sends FCM to invitee.
- `onUserRoleChanged` — Firestore trigger on `users/{uid}` update, calls `admin.auth().setCustomUserClaims({role})` so Firebase ID tokens carry `role=admin`.
- Manual HTTP twins for the 3 scheduled ones (testing).

**Firestore collections** (7) — `users`, `transactions`, `categories`, `shopping-lists`, `user-groups`, `group-invitations`, `notifications`. Rules in `firestore.rules` use `usersShareGroup(a,b)` helper reading `users.groupIds` array — mirror exactly in RLS.

**Homelab** — Pi 5 8GB ARM64, 14 Docker services. Existing Postgres 17.5 is Nextcloud-dedicated. Adding a service = compose block on `bastion-net` + `nginx/conf.d/<svc>.conf` + Cloudflare Tunnel hostname in dashboard UI.

## Key decisions (opinionated, with one-line justifications)

| Decision | Choice | Why |
|---|---|---|
| Backend host | **Supabase Cloud** (EU region) | Pi has 8GB + 14 services; full Supabase stack (Postgres + GoTrue + PostgREST + Realtime + Kong + Storage + Studio) is 2–3GB steady-state. Free tier covers this app. Fallback: self-host `postgres + postgrest + gotrue` only on Pi (~800MB) behind existing nginx/Tunnel if cost or sovereignty demands. |
| Go BFF fate | **Retire** | 3 reads = 3 SQL queries + views. RLS makes fan-out a one-line predicate. |
| Cloud Functions fate | **Supabase `pg_cron` + triggers + Edge Functions**, one per current function | 1:1 mapping, no new runtime needed. |
| Frontend framework | **SvelteKit, `adapter-static`** | Current app is SPA; keep the shape, preserve PWA/SW story. |
| Data layer | **`@tanstack/svelte-query` + `supabase-js`** | Skip SvelteKit `load()`; keep offline-capable query cache. |
| UI kit | **shadcn-svelte** | Direct port of all components the app uses. |
| i18n | **paraglide-js** | Compile-time, ~0 runtime KB, matches PL-only reality. |
| Push notifications | **VAPID web-push** | Drops Firebase entirely at cutover. ~0KB runtime (native `PushManager`) vs ~200KB Firebase Messaging SDK. Send side: ~40 lines in an Edge Function using `web-push` npm. Bigger Phase 5 but cleaner end state. |
| Auth | **Supabase Auth** (email/password + Google OAuth) | Migrate existing Firebase UIDs via `firebase_uid text unique` column on `users`. Admin role = Supabase custom claim set via `pg_cron` or trigger. |
| Amount sign | **Store positive magnitude + `type` enum** | Codebase already normalizes: `TransactionForm.tsx:117` writes `Math.abs(value.amount)`. Validated — no sign migration needed. |
| Offline queue | **Defer to Phase 6; accept online-only in Phases 3–5** | Current FS offline queue is best-effort anyway. When added: Dexie-backed outbox. |
| Frontend hosting | **Cloudflare Pages** | You already own Cloudflare DNS/Tunnel; free; edge cached; trivial PWA support. |
| Repo layout | **pnpm monorepo** inside the existing `portfelik` repo | `apps/web-svelte`, `apps/web-react` (legacy, removed at cutover), `tools/migrate`, `supabase/`. |

## Proposed Postgres schema (Phase 1)

```sql
-- users: id = auth.users.id (uuid), firebase_uid preserves legacy mapping
create table users (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  firebase_uid text unique,
  settings jsonb not null default '{"notificationsEnabled": false}'::jsonb,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table user_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references users on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Normalize user-groups.memberIds[] into a join table (cheap RLS + indexable)
create table group_members (
  group_id uuid references user_groups on delete cascade,
  user_id uuid references users on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references user_groups on delete cascade,
  group_name text not null,
  invited_user_email text not null,
  invited_user_id uuid references users,
  created_by uuid not null references users,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users on delete cascade,
  name text not null,
  type text not null check (type in ('income','expense')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users on delete cascade,
  category_id uuid references categories on delete set null,
  amount numeric(14,2) not null check (amount >= 0),
  type text not null check (type in ('income','expense')),
  date date not null,
  description text,
  status text not null default 'completed',
  is_recurring boolean not null default false,
  recurring_day smallint check (recurring_day between 1 and 31),
  shopping_list_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on transactions (owner_id, date desc);
create index on transactions (category_id);

create table shopping_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users on delete cascade,
  group_id uuid references user_groups on delete set null,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','completed')),
  total_amount numeric(14,2),
  category_id uuid references categories on delete set null,
  linked_transaction_id uuid references transactions on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users on delete cascade,
  type text not null,
  title text,
  body text,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Web-push subscriptions (replaces users.fcmTokens array; max 5 enforced in app or trigger)
create table push_subscriptions (
  user_id uuid not null references users on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device_type text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);
```

### RLS (mirrors `firestore.rules`)

```sql
alter table transactions enable row level security;

create policy "own or shared-via-group" on transactions for select using (
  owner_id = auth.uid()
  or exists (
    select 1
    from group_members m1
    join group_members m2 on m1.group_id = m2.group_id
    where m1.user_id = auth.uid() and m2.user_id = transactions.owner_id
  )
);

create policy "insert own" on transactions for insert with check (owner_id = auth.uid());
create policy "update own" on transactions for update using (owner_id = auth.uid());
create policy "delete own" on transactions for delete using (owner_id = auth.uid());
```

Analogous policies on `categories` (shared via group), `shopping_lists` (own + `group_id ∈ my groups`), `user_groups` (member or owner), `group_invitations` (invitee-by-email + group owner + creator), `notifications` (own + admin).

### Summary function (replaces Go BFF math)

```sql
create or replace function monthly_summary(p_start date, p_end date, p_category uuid default null)
returns jsonb language sql stable as $$
  with scope as (
    select t.*, c.name as category_name
    from transactions t left join categories c on c.id = t.category_id
    where t.date between p_start and p_end
      and (p_category is null or t.category_id = p_category)
  ),
  totals as (
    select
      coalesce(sum(amount) filter (where type = 'expense'), 0) as total_expenses,
      coalesce(sum(amount) filter (where type = 'income'), 0)  as total_income
    from scope
  ),
  cats as (
    select category_id, category_name,
           sum(amount) as amount, count(*) as transaction_count
    from scope where type = 'expense'
    group by category_id, category_name
  )
  select jsonb_build_object(
    'totalExpenses', t.total_expenses,
    'totalIncome',   t.total_income,
    'delta',         t.total_income - t.total_expenses,
    'categorySummaries',
      coalesce((select jsonb_agg(jsonb_build_object(
        'categoryId', category_id,
        'categoryName', category_name,
        'amount', amount,
        'transactionCount', transaction_count,
        'percentage', case when t.total_expenses = 0 then 0
                           else round((amount / t.total_expenses) * 100, 2) end
      ) order by amount desc) from cats), '[]'::jsonb)
  )
  from totals t;
$$;
```

RLS on `transactions` auto-applies because the function is `security invoker` (default). Call from client: `supabase.rpc('monthly_summary', { p_start, p_end, p_category })`.

### Cloud Functions replacements

| Current function | Replacement |
|---|---|
| `processRecurringTransactions` (monthly cron) | `pg_cron` job: SQL that inserts new rows based on `is_recurring=true` templates. |
| `updateTransactionStatuses` (daily cron) | `pg_cron` job: `update transactions set status=...` based on date. |
| `sendAdminTransactionSummary` (weekly cron) | `pg_cron` triggers a Supabase **Edge Function** (`send-admin-summary`) — aggregates via SQL, composes i18n body, sends via `web-push` to every row in `push_subscriptions` for each admin, writes `notifications` row. VAPID private key in Supabase secrets. |
| `onGroupInvitationCreated` (FS trigger) | Postgres `after insert` trigger → `pg_net.http_post` to Edge Function `send-group-invitation-push` (also `web-push`-based). |
| `onUserRoleChanged` (FS trigger) | Postgres trigger on `users.role` → calls `auth.admin.update_user_by_id` via Edge Function to set `app_metadata.role`. Supabase JWT then carries `role` claim. |

## Phased execution

### Phase 0 — Baseline & safety net
- Tag current `main` as `v-firestore-final`; `gcloud firestore export gs://...` snapshot.
- Vitest port of Go summary math into `apps/web-react/src/modules/transactions/summary.test.ts` — this becomes the contract both old and new implementations must satisfy.
- Commit `firestore.indexes.json` + `firestore.rules` into migration notes.
- **Rollback**: N/A — read-only. **Exit**: export verified restorable in scratch project.

### Phase 1 — Supabase project & schema
- Create Supabase Cloud project (EU region). CLI: `supabase init` in repo at `supabase/`.
- Author `supabase/migrations/0001_init.sql` with schema above.
- `supabase/migrations/0002_rls.sql` with policies mirroring `firestore.rules`.
- `supabase/migrations/0003_functions.sql` with `monthly_summary()` + triggers.
- Seed two test users + one shared group in `supabase/seed.sql`; write a manual RLS check script.
- **Rollback**: `supabase db reset`. **Exit**: RLS verified via Studio with two JWTs; `monthly_summary()` returns same shape as Go against identical seed data.

### Phase 2 — Data migration dry run
- Node script `tools/migrate/` using `firebase-admin` + `@supabase/supabase-js` (service_role key).
- Import order: users → user_groups → group_members (explode `memberIds[]`) → categories → transactions → shopping_lists → notifications. Skip `fcmTokens` — users re-subscribe on first login (VAPID format incompatible with FCM tokens).
- Build `firebase_uid → supabase_uid` map upfront via `auth.admin.createUser({ email, password: random(), email_confirm: true })`. Persist map to `tools/migrate/uid-map.json` for idempotent re-runs.
- Normalize: `amount = Math.abs()`, timestamps → ISO, `groupIds[]` → `group_members` rows.
- **Rollback**: `supabase db reset && rerun`. **Exit**: row counts match Firestore export ±0; spot-check 10 random txns across 2 users for correct owner, group visibility, sign.

### Phase 3 — SvelteKit skeleton (parallel)
- `apps/web-svelte` via `create-svelte` → `adapter-static`, TypeScript, Tailwind v4.
- `shadcn-svelte init`, port design tokens from existing `tailwind.config.js`.
- Install: `@supabase/supabase-js`, `@tanstack/svelte-query`, `paraglide-js`, `bits-ui` (for any gaps).
- Supabase client singleton `src/lib/supabase.ts`; query client in `+layout.svelte`.
- Port `pl.json` to paraglide messages.
- Login/register/Google OAuth pages only. Google OAuth: reuse existing GCP client ID, add Supabase callback URL to authorized redirects.
- Deploy to Cloudflare Pages at `portfelik-v2.bastionreda.online` (via Cloudflare Tunnel→nginx proxy→Pages). Staging domain so prod DNS is untouched.
- **Rollback**: DNS untouched. **Exit**: migrated user logs in on staging; no data screens yet.

### Phase 4 — Read-only feature parity
- Port routes in order (least→most coupled): categories → transactions list+filters → summary screen (`rpc('monthly_summary')`) → shopping lists → groups → notifications → admin.
- Replace TanStack Router file conventions with SvelteKit's; keep URL shapes so bookmarks survive.
- shadcn-svelte 1:1 component swap. Gaps (rare): use `bits-ui` primitive directly.
- Port service worker: start from existing `public/sw.js` (static cache-first + dynamic network-first). Rewrite `push` event handler for raw VAPID payload (JSON `{title, body, data}`) — drop Firebase Messaging branch entirely. Adapt VitePWA config for SvelteKit adapter-static.
- **Rollback**: users still on React app. **Exit**: every read screen renders correctly against staging DB; Phase 0 summary contract passes in SvelteKit.

### Phase 5 — Mutations + Cloud Functions replacements
- Port all create/update/delete paths with `@tanstack/svelte-query` mutations + optimistic updates.
- Generate VAPID keypair: `npx web-push generate-vapid-keys`. Public key → `VITE_VAPID_PUBLIC` env; private key → Supabase secret `VAPID_PRIVATE`.
- Client subscribe flow: `registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: VITE_VAPID_PUBLIC})` → upsert `{endpoint, p256dh, auth}` into `push_subscriptions`.
- Deploy Edge Functions (Deno, `web-push` from `npm:web-push`):
  - `send-admin-summary` — port `functions/src/notifications/sendAdminTransactionSummary.ts` logic (aggregation + i18n body). Send side: iterate `push_subscriptions` for each admin, `webpush.sendNotification(sub, payload)`. On 404/410, delete the row.
  - `send-group-invitation-push` — port `functions/src/notifications/sendGroupInvitationNotification.ts`, same `web-push` send pattern.
  - `sync-user-role` — replaces `onUserRoleChanged`; sets `app_metadata.role` via Supabase Admin API.
- Create `pg_cron` jobs:
  - `processRecurringTransactions`: monthly SQL insert from `is_recurring=true` templates.
  - `updateTransactionStatuses`: daily SQL update by date.
  - `send-admin-summary` trigger: `pg_cron.schedule('0 8 * * 1', $$ select net.http_post(...) $$)`.
- Postgres triggers:
  - `after insert on group_invitations` → `net.http_post` to `send-group-invitation-push`.
  - `after update of role on users` → `net.http_post` to `sync-user-role`.
- **Do not migrate Firebase FCM tokens** — VAPID subscriptions are a different crypto format. Users re-subscribe on first login to the new app; SW prompts for permission if `Notification.permission !== 'granted'`.
- **Rollback**: dual-run — old functions stay alive until cutover; new functions target staging DB only. **Exit**: full CRUD parity; push received on desktop + installed PWA; admin weekly summary delivered to a test admin.

### Phase 6 — Offline queue (optional)
- Dexie table `outbox(id, op, table, payload, created_at)`.
- Mutation wrapper: if `!navigator.onLine` enqueue; on `online` event drain FIFO.
- Conflict policy: last-write-wins (matches current Firestore behavior).
- **Rollback**: trivial — feature-gate. **Exit**: airplane-mode add-transaction syncs on reconnect.

### Phase 7 — Cutover
- ~30-min maintenance window: re-run migration script in delta mode (or full re-import — low-cost personal app).
- DNS flip: `portfelik.<prod-domain>` → Cloudflare Pages (was Firebase Hosting).
- Stop Cloud Run BFF (if still deployed).
- Disable Firebase Functions (not delete — 30-day safety).
- Firebase Hosting release disabled; Firestore read-only for 30 days.
- **Rollback**: DNS revert; Firestore is still authoritative because we freeze writes to it during cutover. **Exit**: 7 days post-cutover, zero P1 bugs.

### Phase 8 — Hardening & cleanup
- Playwright e2e: login, add txn, see it in summary, invite group member, shared txn visible across accounts.
- Vitest: summary-math contract, RLS tests via two `supabase-js` clients with different JWTs.
- GitHub Actions: CI on PR (typecheck + vitest + playwright), preview deploy per branch via Cloudflare Pages.
- Delete Firestore data, Firebase Hosting site, Cloud Run service, `portfelik-bff/` dir (tombstone commit).
- **Exit**: old infra gone, CI green.

## Critical files to read before starting each phase

- **Phase 0**: `portfelik-bff/internal/repositories/transaction_repository.go:173-326` (summary math to port to Vitest).
- **Phase 1**: `firestore.rules` (full file — every policy needs an RLS equivalent).
- **Phase 2**: `src/lib/firebase/firestore.ts:60-299` (collection names, timestamp conversion patterns).
- **Phase 3**: `src/lib/service-worker.ts`, `public/sw.js`, `vite.config.ts:14-31` (PWA config).
- **Phase 4**: `src/routes/` tree, `src/modules/transactions/hooks/useTransactionsQuery.ts` (BFF call pattern).
- **Phase 5**: every file in `functions/src/` — scheduler cadences, FCM payload shapes, i18n helper usage.

## Verification (end-to-end)

1. **Schema**: `supabase db reset && supabase db push` succeeds; all RLS policies present via `\d+` check.
2. **Summary parity**: identical seed data into Firestore + Postgres → Go BFF `/api/v1/transactions/summary` and `rpc('monthly_summary')` produce byte-identical JSON (modulo key order).
3. **Group sharing**: as user A in group G, create txn; user B in G sees it in list + summary; user C (not in G) does not.
4. **Auth**: Google OAuth login, email/password login, role claim present in JWT (check via `supabase.auth.getSession()`).
5. **Push**: subscribe via `PushManager` → `push_subscriptions` row created; admin summary arrives on Monday 08:00 Europe/Warsaw; group invitation push arrives within 30s of invite creation. On subscription expiry (410 Gone), row is pruned.
6. **PWA**: install to home screen; airplane-mode read works; (Phase 6) add-txn queues + syncs.
7. **Playwright**: all e2e flows green against staging Supabase + Cloudflare Pages preview.

## Open questions for the user

1. **Google OAuth**: reuse existing GCP OAuth client (add Supabase redirect URL) or create fresh? Reuse is less churn.
2. **Admin role storage**: Firebase had custom claims on the JWT (`role=admin`). Supabase equivalent is `app_metadata.role`. Confirm fine to mirror exactly — RLS uses `(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'`.
3. **Cutover timing**: any blackout windows to avoid? Weekly admin summary runs Monday 08:00 — cutover outside that.
4. **Legacy-UID grace period**: keep `firebase_uid` column forever or drop after N months?
5. **Post-cutover notification UX**: on first login to SvelteKit app, prompt for push permission immediately or wait until user opens admin page? Existing UX prompts on first login — recommend keeping.

## Deliverables summary

- New app: `apps/web-svelte/` (SvelteKit + Supabase + shadcn-svelte).
- Supabase project: migrations + RLS + `monthly_summary()` RPC + 3 `pg_cron` jobs + 3 Edge Functions + 2 triggers.
- One-off migration script: `tools/migrate/`.
- Legacy: `apps/web-react/` removed at Phase 8; `portfelik-bff/` tombstoned.
- Hosting: Cloudflare Pages (frontend), Supabase Cloud (backend). Homelab unchanged.
