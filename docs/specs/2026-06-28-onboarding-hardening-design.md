# Spec 1 — Onboarding hardening (newcomer path)

Date: 2026-06-28  
Status: Approved; implemented (2026-06-28)  
Branch base: `dev`

## Context

Portfelik is preparing for invited beta users and a later rebrand to **JakStoimy**
(see `apps/web-svelte/JakStoimy-Design-System/`). Newcomers need a guided first
session without building a generic task system or self-serve signup funnel.

This spec covers **onboarding core only**: checklist, empty-state CTAs, glossary,
client-side demo, and an instrumentation **event-schema appendix** with a no-op
`track()` stub. Plausible wiring, coachmarks, Capacitor, group-scope cash, dashboard
slice 2, and self-serve signup are **out of scope** (forward stubs at the end).

### Ops reality (Increment 0 reconcile)

Staging and production Supabase are both migrated through `20260723` (verified via
`list_migrations`). Migration apply / promote steps from older planning notes are
**done** — do not repeat them in this spec.

What remains in Increment 0 (prereq cleanup, **not** this spec):

- Beta instrumentation (real provider wiring → own Plausible spec).
- `CLAUDE.md` / architecture doc reconcile (remove stale migration-pending notes).
- Stale `shopping_lists_*` i18n keys + any hardcoded chart strings.
- `+error.svelte` boundary (see `docs/specs/2026-06-21-error-handling-design.md`).

Invite-only + Google OAuth is an **intentional beta decision**, not a gap.

### Locked decisions

| Topic | Decision |
| --- | --- |
| Spec scope | Onboarding core + instrumentation schema appendix |
| Demo data | Client-side seed via existing create services; `Demo:` description prefix; zero migrations/RPCs |
| Instrumentation provider | Plausible in a **separate** spec; this spec defines event names + `track()` no-op |
| Coachmarks | Deferred until instrumentation exists |
| Capacitor | Phase-A wrapper only; own spec |
| Rebrand | Own coordinated cutover spec; **this spec must survive rebrand with ~0 rework** |

### Rebrand constraint (all work in this spec)

- All user-facing copy uses `m.app_name()` — **never** a literal `"Portfelik"`.
- No brand-locked imagery in onboarding/glossary/demo surfaces (no Portfelik logo,
  favicon, or OG assets).
- Glossary and checklist copy must read naturally when `app_name` becomes JakStoimy.
- Design tokens and the JakStoimy DS (`JakStoimy-Design-System/tokens/`, logo assets)
  land in the **rebrand spec**, not here. Onboarding components use existing
  `Card` / `Button` / `ProgressBar` / `Sheet` primitives and semantic tokens only.

### Implementation delta (local tree, 2026-06-28)

Partial work already exists uncommitted — finish and harden rather than rewrite:

| Area | Exists | Gaps |
| --- | --- | --- |
| Checklist | `onboarding-progress.ts`, `DashboardOnboardingChecklist.svelte`, dashboard wiring | Optional reminders step; `localStorage` first-paint mirror; progress bar; persist derived completion to profile |
| Glossary | `content/glossary.ts` (9 terms), `GlossarySheet.svelte`, Settings entry | Expand to ~12–18 terms; move strings to `pl.json` (`glossary_*`); `InfoTooltip` `entryId` link; fix `glossary_open_settings` literal brand |
| Empty CTAs | Transactions import + manual add in `TransactionTable` | Recurring empty → deep link; dashboard upcoming empty → `/transactions?status=upcoming` |
| Demo | — | `services/demo-data.ts`, showcase banner, Settings + checklist entry points |
| Analytics | — | `lib/analytics.ts` no-op `track()` + call sites for schema events |
| Tests | `onboarding-progress.spec.ts` (1 case) | Glossary lookup, demo seed/clear guards, E2E `onboarding.spec.ts` |

## Problems

1. **No single newcomer spine** — dashboard, import, transactions, and plans each
   have isolated hints (`plans-hub-onboarding` is `localStorage`-only).
2. **Glossary is thin and brand-locked** — nine hardcoded Polish strings; Settings
   copy mentions "Portfeliku".
3. **Empty states under-guide** — recurring and dashboard upcoming blocks are text-only.
4. **No safe preview path** — users with zero data cannot explore the product loop
   without importing or hand-typing rows.
5. **No instrumentation contract** — beta success metrics undefined; Plausible wiring
   blocked on event names.

## Scope

### In scope

1. **Onboarding checklist** — server-backed state, data-derived completion, dismiss.
2. **Empty-state CTAs** — deep-linked actions on key zero-data surfaces.
3. **Glossary** — structured entries, searchable sheet, optional tooltip deep links.
4. **Client-side demo** — seed/clear via existing services; showcase banner.
5. **Instrumentation schema** — typed event names + no-op `track()` stub.
6. **Tests & gates** — unit + E2E; Paraglide recompile when `pl.json` touched.

### Out of scope (→ separate specs)

- Plausible script wiring, domain, and dashboard views.
- Coachmarks / product tours.
- Capacitor native wrapper.
- Full rebrand cutover (name, logo, favicon, PWA manifest, domain, OAuth consent,
  email templates, push title).
- Self-serve signup funnel.
- Group-scope cash position; dashboard actions slice 2.

## Design

### 1. Onboarding checklist

**State:** `profiles.settings.onboarding` (jsonb; same pattern as `avatarPresetId`
and `alerts.bankImportReminder`). Shape:

```ts
interface OnboardingProgress {
  dismissed?: boolean;
  completed?: Partial<Record<OnboardingStepId, boolean>>;
}
```

**Mirror:** `localStorage` key `onboarding-dismissed` (and optionally
`onboarding-completed` snapshot) for first paint before profile fetch — server
wins on conflict.

**Service:** extend `services/onboarding-progress.ts`:

- `readOnboardingProgress(settings)` — already exists.
- `deriveOnboardingFromSignals({ progress, visitedDashboard, hasCommittedImport,
  transactionCount, hasPlanOrNetWorth, importReminderEnabled? })` — already
  exists; add optional reminders signal.
- `isOnboardingComplete`, `buildOnboardingSteps`, `mergeOnboardingProgress` —
  already exist.
- **New:** `persistDerivedProgress()` helper pattern — when derived completion
  advances beyond stored `completed`, patch profile (debounced / on meaningful
  delta only).

**Steps (in order):**

| Id | Label (pl.json) | Done when | Navigate |
| --- | --- | --- | --- |
| `dashboard` | Poznaj Pulpit | User lands on `/dashboard` | `/dashboard` |
| `import` | Zaimportuj wyciąg | ≥1 committed import session | `/import` |
| `transactions` | Sprawdź transakcje | `transactionCount > 0` | `/transactions` |
| `plans` | Ustaw majątek lub plan | ≥1 plan **or** net-worth snapshot saved | `/plans` |
| `reminders` (optional) | Przypomnienia o imporcie | `settings.alerts.bankImportReminder.enabled` | `/settings` |

The optional `reminders` step does **not** block `isOnboardingComplete` — checklist
can show "all core steps done" while reminders remain as a soft nudge.

**UI:** `DashboardOnboardingChecklist.svelte` on `/dashboard` when
`!dismissed && !allCoreComplete`. Compact card (reuse existing card styling /
`ProgressBar` for `done/total`). Fold orienter headline into the card title area —
**no** separate welcome strip (YAGNI). Dismiss writes `dismissed: true` to profile
+ localStorage mirror.

**Plans hub:** keep the existing one-line `plans-hub-onboarding` dismissible hint
on `/plans` as a **local** nudge — it is hub-specific, not part of the global
checklist.

Acceptance:

- Checklist visible for a fresh profile with no dismiss and incomplete core steps.
- Steps auto-check from real data (not manual ticks).
- Dismiss persists cross-device; hidden after dismiss or all core steps complete.
- Import step CTA navigates to `/import`; plans step to `/plans`.

### 2. Empty-state CTAs

Extend consumers of `EmptyState.svelte` (component already supports `action`
snippet — no API change required unless a shared `actions` array helper is useful).

| Surface | When empty | Actions |
| --- | --- | --- |
| `/transactions` (no rows) | `showEmptyActions` | **Importuj wyciąg** → `/import`; **Dodaj ręcznie** → open create dialog (exists) |
| `/recurring` | no active templates | **Przejdź do transakcji** → `/transactions` (create recurring from tx dialog) |
| Dashboard upcoming block | `upcomingTxs.length === 0` | Replace plain `<p>` with compact empty row + link → `/transactions?status=upcoming` |

Copy in `messages/pl.json`; brand-neutral (`m.app_name()` only where the app name
appears).

Acceptance: each CTA navigates to the documented route; transactions manual-add
still opens the dialog without navigation.

### 3. Glossary

**Content:** `src/lib/content/glossary.ts` — structure:

```ts
interface GlossaryEntry {
  id: string;
  term: string;       // display title — from pl.json glossary_term_{id}
  short: string;      // glossary_short_{id}
  long?: string;      // glossary_long_{id} (optional)
  seeAlso?: string[]; // entry ids
  surfaces?: string[]; // optional: where term appears ("dashboard", "import", …)
}
```

**Terms (~12–18):** Import, Transakcje, Plany, Rozliczenie, Saldo bieżące,
Przewidywane saldo, Prognoza, Majątek netto, Nadwyżka, Cykliczne, Inne, Reguła
kategoryzacji, Refinansowanie, Grupa, Współwłaściciel, Odsetki, Raty.

IDs stay stable ASCII slugs (`import`, `saldo`, `majatek_netto`, …) so
`InfoTooltip` and analytics can reference them across rebrand.

**UI:** `GlossarySheet.svelte` (exists) — search via `searchGlossary()`. Entry
from Settings → Profile tab. **Extend** `InfoTooltip.svelte` with optional
`glossaryEntryId?: string` → renders "Dowiedz się więcej →" opening the sheet
focused on that entry (portal sheet or inline expand — pick simplest during impl).

Wire `glossaryEntryId` on at least: balance/saldo tooltip, import-health card,
net-worth strip (incremental — not every tooltip in one PR).

Acceptance:

- Settings opens searchable glossary; all listed terms present.
- `glossary_open_settings` uses `m.app_name()`, not a literal brand string.
- At least one `InfoTooltip` deep-links to a glossary entry.

### 4. Demo (client-side)

**Service:** `services/demo-data.ts`

```ts
const DEMO_PREFIX = "Demo:";

async function seedDemoData(ctx): Promise<{ inserted: number }>
async function clearDemoData(ctx): Promise<{ deleted: number }>
function hasDemoData(transactions): boolean
function canSeedDemo(transactionCount, hasCommittedImport): boolean
```

**Seed:** ~15–25 rows via existing `createTransaction`, `createPlan`, recurring
template create — descriptions/titles prefixed `Demo:`. Include: 2–3 months of
txs, 1 save plan, 1 debt plan, 1 recurring template. Use system/default
categories; do not invent new categories.

**Guards:**

- Block seed when user has **any** non-demo transactions (`canSeedDemo` false).
- **Do not** write `cash_positions` — demo must not pollute the shared cash anchor.

**Clear:** delete own rows where `description LIKE 'Demo:%'` (transactions) and
matching plan titles / recurring descriptions; use existing delete services where
possible for cache invalidation.

**UI:**

- Showcase banner (dashboard + transactions when demo active): "Przeglądasz dane
  przykładowe" + **Usuń demo** / **Importuj swoje** (→ `/import`).
- Entry points: checklist secondary "Zobacz przykład", dashboard empty secondary,
  Settings load/clear controls.

**Analytics:** `demo_loaded`, `demo_cleared` via `track()`.

Acceptance:

- Fresh user can load demo and see banner + populated dashboard/transactions/plans.
- Clear removes all `Demo:` rows; banner disappears.
- Seed blocked when real data exists.
- No `cash_positions` row created.

### 5. Instrumentation schema (`lib/analytics.ts`)

No-op stub for now — Plausible binds later.

```ts
export type AnalyticsEvent =
  | "onboarding_started"
  | "first_import_committed"
  | "first_transaction_created"
  | "first_plan_created"
  | "first_settlement_linked"
  | "demo_loaded"
  | "demo_cleared"
  | "import_reminder_enabled"
  | "glossary_opened"
  | "pwa_installed"
  | "push_enabled";

export function track(event: AnalyticsEvent, props?: Record<string, string | number | boolean>): void {
  if (import.meta.env.DEV) console.debug("[analytics]", event, props);
}
```

**Rules:** no PII — enums, counts, entry ids only. Fire `onboarding_started` once
when checklist first shown; milestone events once per user where detectable
(localStorage dedupe flags acceptable until Plausible spec).

**Appendix — event catalog:**

| Event | When | Props (optional) |
| --- | --- | --- |
| `onboarding_started` | Checklist first rendered | `step_count` |
| `first_import_committed` | First import session committed | — |
| `first_transaction_created` | First non-demo tx | `source`: `import` \| `manual` \| `demo` |
| `first_plan_created` | First plan | `kind`: `save` \| `debt` |
| `first_settlement_linked` | First plan–tx link | `kind` |
| `demo_loaded` | Demo seed succeeds | `row_count` |
| `demo_cleared` | Demo clear succeeds | `row_count` |
| `import_reminder_enabled` | Reminder toggled on | `cadence_days` |
| `glossary_opened` | Sheet opened | `entry_id?`, `source`: `settings` \| `tooltip` |
| `pwa_installed` | `appinstalled` | — |
| `push_enabled` | Push opt-in success | — |

## Files touched (anticipated)

- `src/lib/services/onboarding-progress.ts` — reminders signal, persist helper
- `src/lib/components/dashboard/DashboardOnboardingChecklist.svelte` — progress bar, reminders step
- `src/routes/dashboard/+page.svelte` — checklist visibility, demo banner, upcoming empty CTA
- `src/lib/content/glossary.ts` — expand entries; paraglide key refs
- `src/lib/components/ui/GlossarySheet.svelte` — optional focused entry
- `src/lib/components/ui/InfoTooltip.svelte` — `glossaryEntryId`
- `src/lib/services/demo-data.ts` — **new**
- `src/lib/analytics.ts` — **new**
- `src/lib/components/ui/EmptyState.svelte` — only if shared multi-action helper needed
- `src/routes/recurring/+page.svelte` — empty CTA
- `src/lib/components/transactions/TransactionTable.svelte` — verify empty actions wired at page level
- `src/lib/components/settings/ProfileTab.svelte` — demo controls
- `messages/pl.json` + `src/lib/paraglide/**`
- `tests/unit/onboarding-progress.spec.ts`, `tests/unit/glossary.spec.ts`, `tests/unit/demo-data.spec.ts`
- `e2e/tests/onboarding.spec.ts` — **new**

## Testing & gates

- **Unit:** step derivation (incl. reminders optional), glossary search/by-id,
  demo seed guard, demo clear filter, `track()` no-op does not throw.
- **E2E `onboarding.spec.ts`:** checklist visible → CTA navigates; demo load →
  banner → clear; glossary opens from Settings.
- `pnpm exec svelte-check --tsconfig ./tsconfig.json` — 0 errors, 0 warnings.
- `pnpm lint` — 0 errors.
- `pnpm format:check` (fix with `pnpm format` if needed).
- Paraglide recompile after `pl.json` edits.
- Secret scan on changed files.
- No new migrations.

## Risks

- **Demo delete scope** — `LIKE 'Demo:%'` must not match user-authored descriptions;
  prefix is intentionally distinctive; document in Settings copy.
- **Profile write churn** — persisting derived completion on every dashboard visit;
  only patch when `completed` object actually changes.
- **Glossary i18n volume** — ~18 terms × 2–3 strings; keep IDs stable for tooltip
  wiring across rebrand.

## Forward stubs (separate specs)

### Spec 2 — Plausible instrumentation

Wire `track()` to Plausible custom events; staging vs prod domain; consent/cookie
posture; dashboard goals mapping to the event catalog above.

### Spec 3 — Coachmarks

Contextual first-visit highlights **after** instrumentation ships; keyed dismiss
state; no overlap with checklist.

### Spec 4 — Capacitor Phase A

Wrapper-only native shell; deep links; status bar; no custom native plugins.

### Spec 5 — JakStoimy rebrand cutover

Coordinated swap: `m.app_name()` value, `messages/pl.json`, `<title>`/meta,
logo + favicon + PWA icons + splash + OG image (`JakStoimy-Design-System/assets/`),
`manifest.webmanifest`, design tokens in `app.css`, domain
(`portfelik.adrianzinko.com` → `jakstoimy.*`), Cloudflare Pages project name,
Google OAuth consent + redirect URIs, Supabase auth email templates, push
notification title, privacy policy, repo/docs rename. Onboarding/glossary/demo
from Spec 1 should require **no** copy edits if `app_name` constraint was followed.

## Success metrics (beta)

Track via Plausible once Spec 2 lands; define targets during beta review:

- ≥60% of invited users complete import step within 7 days.
- ≥40% create or link a plan within 14 days.
- Demo load rate among zero-data users (instrumented).
- Glossary opens per active user (instrumented).
