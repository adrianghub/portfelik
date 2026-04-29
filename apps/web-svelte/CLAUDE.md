# SvelteKit App — Claude guidance

Loaded automatically when working in `apps/web-svelte/`.

## Architecture decisions

| Choice | Rule |
|---|---|
| `adapter-static` | No SSR. Use `@supabase/supabase-js` base client. **Do NOT use `@supabase/ssr`**. |
| Svelte 5 runes | `$state`, `$derived`, `$effect` — not stores. |
| TanStack Query v6 | Options as functions (runes API). `createQuery`, `createMutation` from `@tanstack/svelte-query`. |
| Paraglide v2 | Vite plugin only — no adapter. Compile-time i18n. Recompile after `messages/pl.json` edits. |
| Supabase client | Singleton at `src/lib/supabase.ts`. Query client provided in `+layout.svelte`. |
| Auth | Google OAuth only. Email/password sign-up disabled. |
| Group writes | All via SECURITY DEFINER RPCs in `services/groups.ts`. Direct table writes blocked by RLS. |
| Summary computation | `computeSummary(transactions)` in `services/transactions.ts` — derived client-side, no RPC round-trip. |

## Key file locations

**Services** (`src/lib/services/`):
- `transactions.ts` — `fetchTransactions(start, end, categoryId?)`, `computeSummary(txs)`, `createTransaction`, `updateTransaction`, `deleteTransaction`
- `categories.ts` — `fetchCategories`, `createCategory`, `updateCategory`, `deleteCategory`
- `groups.ts` — all group SECURITY DEFINER RPCs
- `shopping-lists.ts` — `fetchShoppingLists`, `fetchShoppingListById`, `fetchShoppingListItemHistory`, item CRUD, `completeShoppingList`
- `profiles.ts` — `fetchProfile`, `updateProfile`, `assignAdminRole`, `revokeAdminRole`
- `notifications.ts` — `fetchNotifications`, `markNotificationRead`, `markAllNotificationsRead`, `deleteNotification`
- `push.ts` — `registerServiceWorker`, `autoSubscribePush`, `requestAndSubscribePush`, `unsubscribeFromPush`

**Components** (`src/lib/components/`):
- `ui/` — `Dialog`, `ConfirmDialog`, `NotificationsPopover`
- `transactions/` — `MonthRangePicker`, `CategoryFilter`, `TransactionTable` (shared tx badge, row click), `TransactionDialog`, `TransactionDetailSheet`, `SummaryCards`, `CategoryBreakdown` (clickable)
- `settings/` — `CategoriesTab`, `GroupsTab`, `ProfileTab`, `CategoryDialog`
- `shopping-lists/` — `ShoppingListCard`, `ShoppingListSuggestions`

**Utils** (`src/lib/utils.ts`): `cn`, `formatCurrency`, `formatDate`, `getMonthBounds`, `getDateRangeBounds`, `monthName`, `monthYearLabel`

**Types** (`src/lib/types.ts`): `Transaction`, `TransactionWithCategory`, `MonthlySummary`, `CategorySummary`, `Category`, `Profile`, `UserGroup`, `GroupMember`, `GroupMemberWithProfile`, `GroupInvitation`, `ShoppingList`, `ShoppingListItem`, `ShoppingListWithItems`, `Notification`

**i18n**: `messages/pl.json` — always recompile after editing.

## Dev commands (from `apps/web-svelte/`)

```bash
pnpm dev
pnpm build
pnpm exec svelte-check --tsconfig ./tsconfig.json   # must be 0 errors, 0 warnings
pnpm lint                                            # must be 0 errors
pnpm format                                          # auto-fix
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
```

## Gotchas

See `../../.claude/rules/svelte-gotchas.md` (auto-loaded for this directory). Critical:
- `createMutation` is NOT a store — never `$mutation.xxx`
- PostgREST inserts need `user_id` explicitly
- `$state()` reading a prop → `untrack()`
- Clickable `<li>`/`<tr>`: use `role="button"` + `onkeydown` + conditional `tabindex` — NOT `svelte-ignore`
- `void expr;` in `$effect` to track deps without lint error
