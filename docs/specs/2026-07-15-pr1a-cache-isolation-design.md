# PR 1A — Auth-boundary cache clearing + query-key factory (execution spec)

Status: ready to implement. Part of Phase 1 (Containment). Closes the cross-account TanStack cache leak.
Scope: `apps/web-svelte/src/**` (no schema, no migration). PR 1B handles RLS/authorization.

## Problem (verified)
- `QueryClient` is a module singleton in [`+layout.svelte`](../../apps/web-svelte/src/routes/+layout.svelte) L39-49; there is **no** `queryClient.clear()`/`removeQueries` anywhere in the app.
- On `SIGNED_OUT`/`SIGNED_IN` ([`+layout.svelte`](../../apps/web-svelte/src/routes/+layout.svelte) L204-217) only Svelte state resets; the cache survives, so an account switch (or sign out → sign in as another user) can serve the previous user's cached private data.
- Query keys are global string tuples; only `["profile", userId]` is user-scoped. Full inventory in the appendix.

## Design decision: two layers, one central boundary
1. **Primary fix — central cache clearing** (closes the leak). Clearing happens in exactly ONE place: `+layout.svelte`. Clear on `SIGNED_OUT`; clear on authenticated **user-id change**; never clear on same-user `SIGNED_IN` (Supabase emits sign-in on token refresh/tab focus). `Navigation.svelte` keeps only `supabase.auth.signOut()` (it already does — do **not** add clearing there).
2. **Defense-in-depth — user-namespaced keys** via a factory: private keys become `["user", userId, ...]`; genuinely public data (FX) stays outside the namespace.

Both layers ship in 1A. If review prefers, split at the marked boundary (1A-clear can ship first as the safety fix; 1A-keys follows). Recommendation: ship together so invalidation call sites are migrated once.

---

## Part 1 — Central cache clearing (`+layout.svelte`)

Add a non-reactive identity tracker and fold clearing into the existing load/clear helpers so both the `onAuthStateChange` path and the `getSession` bootstrap path are covered uniformly.

```ts
// module/onMount scope, alongside authRevision
let loadedUserId: string | null = null; // identity the current cache belongs to
```

Update helpers (current: [`+layout.svelte`](../../apps/web-svelte/src/routes/+layout.svelte) L132-154):

```ts
function clearAuthenticatedUser() {
  if (loadedUserId !== null) queryClient.clear(); // only clear when we actually held a user's data
  loadedUserId = null;
  authRevision += 1;
  profile = null;
  user = null;
  userId = null;
  authStatus = "anonymous";
}

function loadAuthenticatedUser(authUser: User) {
  if (loadedUserId !== authUser.id) {
    queryClient.clear();          // account switch (or first load): drop any prior identity's cache
    loadedUserId = authUser.id;
  }
  const revision = (authRevision += 1);
  user = authUser;
  userId = authUser.id;
  authStatus = "authenticated";
  void autoSubscribePush(authUser.id).catch(() => {});
  fetchProfile(authUser.id).then((p) => {
    if (revision === authRevision) { profile = p; applyAccent(p.settings?.accentColor); }
  }).catch(() => {});
}
```

- `onAuthStateChange` (L204-217): keep as-is; `SIGNED_OUT` → `clearAuthenticatedUser()`, `SIGNED_IN` → `loadAuthenticatedUser(session.user)`. Because clearing is inside the helpers keyed on `loadedUserId`, same-user `SIGNED_IN` (token refresh) does **not** clear.
- Bootstrap `getSession` path (L219-244): unchanged — it already calls `loadAuthenticatedUser`/`clearAuthenticatedUser`, which now handle clearing.
- Profile cache mirror subscription (L194-202): it matches `key[0] === "profile"`. After namespacing the profile key becomes `["user", userId, "profile"]`. Simplify the guard to identity-based matching so it is key-shape-agnostic:

```ts
const unsubscribeProfileCache = queryClient.getQueryCache().subscribe((event) => {
  const data = event.query.state.data as Profile | undefined;
  if (data && typeof data === "object" && "id" in data && data.id === userId) {
    profile = data as Profile;
    applyAccent((data as Profile).settings?.accentColor);
  }
});
```

(Or keep a key check updated to `key[0] === "user" && key[2] === "profile"`. Identity match is simpler and safe here.)

### Tests (Part 1)
- Vitest (jsdom) or a focused component test: mount layout stub, seed `queryClient` with a private key, fire a simulated `SIGNED_OUT` → assert `queryClient.getQueryCache().getAll()` is empty.
- Account switch: `loadAuthenticatedUser(userA)` → seed cache → `loadAuthenticatedUser(userB)` clears; `loadAuthenticatedUser(userA)` again with same id (token refresh) does **not** clear.
- E2E (optional, Phase-1 acceptance): sign in as persona A, load `/transactions`, sign out, sign in as persona B, assert B never sees A's rows even before network settles.

---

## Part 2 — Query-key factory + namespacing

### New file: `src/lib/query-keys.ts`
Pure functions; `userId` passed in (keeps them testable). Public keys are separate and unprefixed.

```ts
type Id = string;

const userNs = (userId: Id) => ["user", userId] as const;

export const qk = {
  // private (user-namespaced)
  transactions: {
    all: (u: Id) => [...userNs(u), "transactions"] as const,
    list: (u: Id, ...parts: unknown[]) => [...userNs(u), "transactions", ...parts] as const,
  },
  profile: (u: Id) => [...userNs(u), "profile"] as const,
  categories: (u: Id) => [...userNs(u), "categories"] as const,
  categorizationRules: (u: Id) => [...userNs(u), "categorization_rules"] as const,
  plans: (u: Id) => [...userNs(u), "plans"] as const,
  plan: (u: Id, id: string) => [...userNs(u), "plan", id] as const,
  planLinks: (u: Id, id?: string) => [...userNs(u), "plan-links", ...(id ? [id] : [])] as const,
  planRanked: (u: Id, id: string, ...p: unknown[]) => [...userNs(u), "plan-ranked", id, ...p] as const,
  planEligible: (u: Id, id?: string) => [...userNs(u), "plan-eligible", ...(id ? [id] : [])] as const,
  planDismissed: (u: Id, id: string) => [...userNs(u), "plan-dismissed", id] as const,
  planProgress: (u: Id) => [...userNs(u), "plan-progress"] as const,
  planProgressList: (u: Id, ...p: unknown[]) => [...userNs(u), "plan-progress-list", ...p] as const,
  planDebtTerms: (u: Id, id?: string) => [...userNs(u), "plan-debt-terms", ...(id ? [id] : [])] as const,
  planDebtTermsList: (u: Id, ...p: unknown[]) => [...userNs(u), "plan-debt-terms-list", ...p] as const,
  planDebtDetect: (u: Id, id?: string) => [...userNs(u), "plan-debt-detect", ...(id ? [id] : [])] as const,
  planSuggestionCount: (u: Id, id: string) => [...userNs(u), "plan-suggestion-count", id] as const,
  financialSnapshot: (u: Id) => [...userNs(u), "financial-snapshot"] as const,
  cashPosition: (u: Id) => [...userNs(u), "cash-position"] as const,
  netWorthItems: (u: Id) => [...userNs(u), "net-worth-items"] as const,
  userGroups: (u: Id) => [...userNs(u), "user_groups"] as const,
  myGroupRoles: (u: Id) => [...userNs(u), "my-group-roles"] as const,
  groupInvitationsReceived: (u: Id) => [...userNs(u), "group_invitations_received"] as const,
  groupInvitationsSent: (u: Id, gid?: string) => [...userNs(u), "group_invitations_sent", ...(gid ? [gid] : [])] as const,
  groupMembersProfiles: (u: Id, gid?: string) => [...userNs(u), "group_members_profiles", ...(gid ? [gid] : [])] as const,
  notifications: (u: Id) => [...userNs(u), "notifications"] as const,
  actionDismissals: (u: Id) => [...userNs(u), "action-dismissals"] as const,
  importHealth: (u: Id) => [...userNs(u), "import-health"] as const,
  summary: (u: Id) => [...userNs(u), "summary"] as const,
  saveLinkedIds: (u: Id) => [...userNs(u), "plan-save-linked-ids"] as const,
  importRows: (u: Id, sessionId: string) => [...userNs(u), "import-rows", sessionId] as const,

  // public (NOT namespaced) — reused across users, cache-safe
  fx: () => ["fx", "nbp-table-a"] as const,
} as const;
```

Note: `transactions.all(u)` is a valid **prefix** of every deeper transactions key (`cash-history`, `recurring-templates`, `recurring-skips`, `by-id`, `dashboard-span`, `demo-probe`, `count-probe`, etc.), so existing broad invalidations keep working after migration.

### Reactive current-user access
Query sites need the current user id without threading props through ~30 files. Add:

`src/lib/auth/session.svelte.ts`
```ts
export const session = $state<{ userId: string | null }>({ userId: null });
export function setSessionUser(id: string | null) { session.userId = id; }
```
- `+layout.svelte` calls `setSessionUser(authUser.id)` in `loadAuthenticatedUser` and `setSessionUser(null)` in `clearAuthenticatedUser`.
- Components read `session.userId` and pass it to `qk.*`. Guard queries with `enabled: () => !!session.userId` where a key would otherwise be built with a null id. Most private queries already run only inside authenticated routes, but add the guard on the few that can mount early.

### Migration (call sites)
Replace every private `queryKey: [...]` and matching `invalidateQueries/setQueryData/getQueryData` with the factory. Public FX stays on `qk.fx()` (or leave the literal — unchanged shape).

Files to migrate (from inventory — private keys only):
- Routes: `routes/transactions/+page.svelte`, `routes/dashboard/+page.svelte`, `routes/plans/+page.svelte`, `routes/plans/[id]/+page.svelte`, `routes/plans/[id]/settle/+page.svelte`, `routes/import/+page.svelte`, `routes/admin/+page.svelte`.
- Components: `settings/CategoriesTab.svelte`, `settings/GroupsTab.svelte`, `settings/ProfileTab.svelte`, `settings/CategoryDialog.svelte`, `settings/PersonalizationTab.svelte`, `settings/RulesTab.svelte`, `settings/RuleEditDialog.svelte`, `transactions/TransactionDialog.svelte`, `transactions/TransactionDetailSheet.svelte`, `dashboard/DashboardPlanProgress.svelte`, `dashboard/DashboardNetWorthStrip.svelte`, `dashboard/DashboardActions.svelte`, `ui/NotificationsPopover.svelte`, `onboarding/DemoWalkthroughPanel.svelte`, `onboarding/GuidedTourHost.svelte`, `import/ImportReviewFlow.svelte`.
- Services: `services/notification-sync.ts` (pass a `() => session.userId` or the id into `setupNotificationSync`; invalidate `qk.notifications(u)`), `services/guided-tour-actions.ts` (`qk.profile(userId)`).

Special cases:
- `TransactionDetailSheet.svelte` L158/L172 and `plans/[id]/+page.svelte` L241 and `GroupsTab.svelte` L145/L156 call bare `invalidateQueries()` (whole cache). Leave these as full invalidations (still correct; they refetch current user's data) OR narrow later — not required for 1A.
- `DashboardActions.svelte` uses a local `DISMISSALS_KEY = ["action-dismissals"]`; replace with `qk.actionDismissals(session.userId!)` and gate on user presence.
- `ImportReviewFlow.svelte` uses a `rowsKey` (import rows) + `["categorization_rules"]`; namespace both.
- FX invalidation in `plans/+page.svelte` L433 (`["fx"]`) stays public — either drop from that block or keep as `qk.fx()`; do not user-namespace it.

### Tests (Part 2)
- Unit test `query-keys.spec.ts`: factory output shapes; `transactions.all(u)` is a prefix of `transactions.list(u, ...)`; `fx()` is not namespaced.
- Type check ensures no call site left on the old literal (grep gate below).

---

## Gates
- `pnpm exec svelte-check --tsconfig ./tsconfig.json` → 0/0
- `pnpm lint` → 0, `pnpm format:check`
- `pnpm test` (unit) incl. new `query-keys.spec.ts` and clearing test
- Secret scan on changed files
- Grep gate (no stray private literals): `rg -n "queryKey: \[\"(transactions|plans|plan-|categories|categorization_rules|profile|user_groups|my-group-roles|notifications|cash-position|net-worth-items|financial-snapshot|action-dismissals|import-health|summary)\"" apps/web-svelte/src` returns nothing after migration.

## Commit(s) (suggested)
1. `feat(auth): clear query cache at the central identity boundary` — `+layout.svelte`, `auth/session.svelte.ts`, clearing test. (Ships the leak fix on its own if split.)
2. `refactor(query): user-namespace private query keys via factory` — `query-keys.ts`, all migrated call sites, `notification-sync.ts` signature, `query-keys.spec.ts`.

## Branch
`feat/cache-isolation` off current `dev` (sync latest `origin/dev` before push).

## Out of scope (later PRs)
- Former-member RLS write bypass + authorization matrix → PR 1B.
- Narrowing the bare `invalidateQueries()` whole-cache calls → optional cleanup.

---

## Appendix — current private query-key inventory (namespaces)
`transactions` (+ subkeys: `cash-history`, `cash-position-range`, `recurring-templates`, `recurring-skips`, `by-id`, `dashboard-span`, `plans-surplus`, `demo-probe`, `count-probe`), `summary`, `profile`, `categories`, `categorization_rules`, `plans`, `plan`, `plan-links`, `plan-ranked`, `plan-eligible`, `plan-dismissed`, `plan-progress`, `plan-progress-list`, `plan-debt-terms`, `plan-debt-terms-list`, `plan-debt-detect`, `plan-suggestion-count`, `plan-save-linked-ids`, `financial-snapshot`, `cash-position`, `net-worth-items`, `user_groups`, `my-group-roles`, `group_invitations_received`, `group_invitations_sent`, `group_members_profiles`, `notifications`, `action-dismissals`, `import-health`, import rows key.
Public (keep unscoped): `fx` / `["fx","nbp-table-a"]`.
