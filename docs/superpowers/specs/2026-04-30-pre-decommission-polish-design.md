# Pre-Decommission Polish — Design Spec

**Date:** 2026-04-30  
**Phase:** 7.5 — before Firebase decommission, before Phase 8  
**Goal:** Close 3 functional/UX gaps so real users have a complete experience on the SvelteKit app before Firebase is retired.

---

## Context

Full audit of React legacy vs SvelteKit app revealed 5 gaps. 2 were already implemented (SW `notificationclick` handler navigates to `/settings?tab=groups`; GroupsTab already renders pending invitations at the top when that route loads). 3 remain.

Infrastructure is confirmed complete: `INTERNAL_TRIGGER_SECRET`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY` all set in Supabase Edge Function secrets as of 2026-04-26.

---

## Changes

### 1. Mobile FAB — `+` add-transaction button

**File:** `apps/web-svelte/src/routes/transactions/+page.svelte`

Add a floating action button, mobile-only, fixed bottom-right. Taps the same `openAdd()` handler as the existing toolbar button. Positioned `bottom-20 right-4` (80px from bottom) to clear the 56px mobile bottom nav bar.

```
fixed bottom-20 right-4 z-50 md:hidden
```

- Reuses `m.transaction_add()` for aria-label
- Zinc-900 background, white `+` icon, rounded-full, w-14 h-14
- No new i18n key

---

### 2. Personalized greeting + group context subtitle

**File:** `apps/web-svelte/src/routes/transactions/+page.svelte`

Add two queries using existing service functions:
- `profileQuery` → `fetchProfile(currentUserId!)` (same pattern as admin page)
- `groupsQuery` → `fetchUserGroups()` (same pattern as shopping-lists page)

Replace static `<h1>Transakcje</h1>` with:

```
Cześć, {name}!                          ← greeting (profile.name ?? profile.email)
Widzisz transakcje ze swoich grup       ← if groupsQuery.data?.length > 0
Widzisz swoje transakcje                ← otherwise
```

The greeting renders immediately with profile data; subtitle renders once groups load (no loading skeleton — just omit until ready).

New i18n keys:
| Key | Value |
|---|---|
| `transactions_greeting` | `"Cześć, {name}!"` |
| `transactions_subtitle_groups` | `"Widzisz transakcje ze swoich grup"` |
| `transactions_subtitle_own` | `"Widzisz swoje transakcje"` |

---

### 3. Empty state with date-range context

**Files:**
- `apps/web-svelte/src/lib/components/transactions/TransactionTable.svelte`
- `apps/web-svelte/src/routes/transactions/+page.svelte`

**TransactionTable:** Add optional `emptyLabel?: string` prop. Falls back to `m.transactions_empty()` when not provided.

**Page:** Derive `emptyLabel` from existing URL params (`startYear`, `startMonth`, `endYear`, `endMonth`):

- Single month: `m.transactions_empty_month({ period: monthYearLabel(startYear, startMonth) })`
- Multi-month range: `m.transactions_empty_range({ from: monthYearLabel(startYear, startMonth), to: monthYearLabel(endYear, endMonth) })`

`monthYearLabel()` already exists in `src/lib/utils.ts` and returns Polish month names via `Intl.DateTimeFormat("pl-PL")`.

New i18n keys:
| Key | Value |
|---|---|
| `transactions_empty_month` | `"Brak transakcji w {period}"` |
| `transactions_empty_range` | `"Brak transakcji od {from} do {to}"` |

---

## File change summary

| File | Change |
|---|---|
| `apps/web-svelte/src/routes/transactions/+page.svelte` | FAB + greeting + groups query + profile query + emptyLabel derivation |
| `apps/web-svelte/src/lib/components/transactions/TransactionTable.svelte` | Add `emptyLabel` prop |
| `apps/web-svelte/messages/pl.json` | 5 new keys |
| (recompile) `apps/web-svelte/src/lib/paraglide/` | After pl.json edit |

---

## i18n keys (all 5)

```json
"transactions_greeting": "Cześć, {name}!",
"transactions_subtitle_groups": "Widzisz transakcje ze swoich grup",
"transactions_subtitle_own": "Widzisz swoje transakcje",
"transactions_empty_month": "Brak transakcji w {period}",
"transactions_empty_range": "Brak transakcji od {from} do {to}"
```

---

## Out of scope

- Bulk delete transactions (Phase 8)
- Dark mode (Phase 8)
- Playwright e2e (Phase 8)
- Admin push-test panel (Firebase FCM panels intentionally retired; VAPID push tested via actual device)

---

## Verification checklist

- [ ] Mobile: FAB visible on `/transactions`, hidden on desktop
- [ ] FAB opens same TransactionDialog as toolbar button
- [ ] Greeting shows `name` if set, falls back to email
- [ ] Subtitle shows groups variant when user is in ≥1 group
- [ ] Empty state shows month name for single-month filter
- [ ] Empty state shows range for multi-month filter
- [ ] `svelte-check` 0 errors, 0 warnings
- [ ] `pnpm lint` 0 errors
- [ ] Paraglide recompiled after pl.json edit
