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

## Key file locations

- `src/lib/supabase.ts` — Supabase client singleton
- `src/lib/supabase.types.ts` — generated types (regenerate after schema changes)
- `src/lib/types.ts` — domain types
- `src/lib/utils.ts` — `cn()`, `formatCurrency()`, `formatDate()`
- `src/lib/services/` — one file per domain (`transactions`, `categories`, `groups`, `shopping-lists`, `profiles`, `notifications`, `push`)
- `src/lib/components/ui/` — `Dialog`, `ConfirmDialog`, `NotificationsPopover`
- `messages/pl.json` — i18n source (PL only); always recompile after editing

## Dev commands (from `apps/web-svelte/`)

```bash
pnpm dev                   # Vite dev server
pnpm build                 # production build
pnpm exec svelte-check --tsconfig ./tsconfig.json   # type check (must be 0 errors, 0 warnings)
pnpm lint                  # ESLint (must be 0 errors)
pnpm format                # Prettier (auto-fix)
pnpm format:check          # Prettier (check only)
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide  # after pl.json edit
```

## Gotchas

See `../../.claude/rules/svelte-gotchas.md` (auto-loaded for this directory).
Key ones:
- `createMutation` is NOT a store — never `$mutation.xxx`
- PostgREST inserts need `user_id` explicitly — RLS does not auto-set it
- `$state()` reading a prop → wrap in `untrack()`
