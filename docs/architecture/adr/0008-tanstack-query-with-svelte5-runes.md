# ADR 0008 - TanStack Query v6 with Svelte 5 runes

**Status:** Accepted (2026-04, Phase 4–5)

## Context

The legacy app used TanStack Query against Firestore service classes and was happy with the resulting cache, optimistic updates, and `refetchOnReconnect` behaviour. Migrating to SvelteKit, we needed a server-cache layer that:

- worked with `@supabase/supabase-js` (Promise-based; not a hook ecosystem),
- supported SvelteKit's no-server-runtime model (we are static),
- gave us offline-first reads, opt-in optimistic mutations, and key-based invalidation,
- played well with Svelte 5 runes (no Svelte 4 stores).

`@tanstack/svelte-query` v6 fits exactly: `createQuery` returns a runes-style proxy with `.data`, `.isPending`, `.error`, etc.; `createMutation` returns a similar object with `.mutate(input)` plus a flat reactive surface.

## Decision

**Use `@tanstack/svelte-query` v6 with runes.**

- A single `QueryClient` is instantiated in `+layout.svelte` with these defaults:

  ```ts
  staleTime: 5 * 60 * 1000,       // 5 min
  gcTime: 24 * 60 * 60 * 1000,    // 24 h
  retry: 2,
  networkMode: 'offlineFirst',
  refetchOnReconnect: true,
  ```

- Components use `createQuery` for reads, `createMutation` for writes.
- **`createMutation` is not a Svelte store.** Access fields directly: `mutation.isPending`, `mutation.mutate(...)`. **Never** `$mutation.xxx`. Captured in `.claude/rules/svelte-gotchas.md`.
- Query keys follow consistent shapes: `['transactions', start, end, categoryId?]`, `['plans']`, `['plan', id]`, `['plan-progress', id]`, `['profile', userId]`, `['user-groups']`, `['notifications']`.
- After a mutation succeeds, the calling component invalidates only the keys it changed.

## Consequences

**Good**

- Excellent offline-first read story. Reading the cache is instant; the network is consulted in the background.
- Mutation pattern is uniform. Every form follows the same shape (`mutation.mutate(input)` → invalidate → close).
- Bringing the same library across React → Svelte means the cognitive load of learning a new cache lib is zero.
- Type-safe through and through; query data shapes propagate.

**Bad**

- The store-vs-not-store distinction between `createQuery` and `createMutation` is a real foot-gun and has bitten us. The gotcha file exists because of this.
- `networkMode: 'offlineFirst'` only solves reads. There is no equivalent built-in "queue this mutation while offline". See audit item G1.

**Neutral**

- The `staleTime: 5 min` choice is a deliberate decision against Realtime subscriptions; see ADR 0009.

## Alternatives considered

- **SvelteKit `load()` functions.** Built-in, no external dep - but the static adapter has no server runtime to run them, and they don't help with mutations or in-flight refetch.
- **Svelte `$query` from `@sveltejs/svelte-query`.** Older, store-based, doesn't expose runes proxies the same way.
- **Roll our own with `$state` + `fetch`.** Reasonable for one or two endpoints; loses the years of polish in TanStack Query (request dedup, retry semantics, garbage collection, devtools).
