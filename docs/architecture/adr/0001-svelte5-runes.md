# ADR 0001 — Adopt Svelte 5 runes (no stores)

**Status:** Accepted (2026-04, Phase 3)

## Context

Migrating from React 19 + Hooks. Svelte 4's reactivity model is reactive declarations and stores. Svelte 5 introduced runes (`$state`, `$derived`, `$effect`, `$props`) as a new, opt-in reactivity primitive that works the same way inside `.svelte` and `.svelte.ts` files and that finally unifies the "module vs component reactivity" split.

We needed to pick one model for the new SvelteKit app. Mixing both is technically supported but produces inconsistent code that confuses both contributors and tooling.

## Decision

Use **runes exclusively**. No Svelte stores in application code. Component state is `$state`, derivations are `$derived`, side effects are `$effect`. Props are `$props()` with destructuring.

## Consequences

**Good**

- Single mental model. State and reactivity behave the same in components, helpers, and `.svelte.ts` modules.
- Aligns with the model the framework is steering toward; new Svelte tooling targets runes first.
- Cleaner mental mapping from React Hooks (`useState` → `$state`, `useMemo` → `$derived`, `useEffect` → `$effect`).
- TanStack Query's `createQuery` / `createMutation` return runes-style proxies, not stores — using runes everywhere avoids the `$store` vs `query.data` mismatch.

**Bad**

- Some Svelte ecosystem libraries still expose only stores; we adapt with thin wrappers when needed.
- Runes have foot-guns (e.g. `$state` reading a prop produces `state_referenced_locally`; `$effect` tracking deps requires `void expr`). Captured in `.claude/rules/svelte-gotchas.md`.

**Neutral**

- Runes require Svelte 5 + SvelteKit 2; we're on both anyway.

## Alternatives considered

- **Stores everywhere.** Smaller cognitive jump from React's "library returns store, you `$subscribe`" pattern, but locks us out of the runes-native idioms and against the direction of the framework.
- **Mix runes for components, stores for cross-cutting state.** Tempting for things like the auth session, but creates two reactivity models in the same codebase. We have one source of cross-cutting state (the Supabase session) and it is plumbed via component props plus an `onAuthStateChange` listener — no store needed.
