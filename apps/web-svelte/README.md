# Portfelik Web App

SvelteKit SPA for Portfelik. Product direction and repository-level setup live
in the root [README](../../README.md).

## Local Development

```bash
pnpm install
pnpm dev
```

The app reads `.env.local`, which normally points at the local Supabase stack.
From the repository root:

```bash
supabase start
supabase db reset
cd apps/web-svelte
pnpm seed:local
```

## Checks

```bash
pnpm exec svelte-check --tsconfig ./tsconfig.json
pnpm lint
pnpm format:check
pnpm test:unit
pnpm test:components
```

### E2E (Playwright, mocked Supabase)

Chromium is installed automatically on `pnpm install` (`postinstall`). If browsers
are missing after an upgrade, run:

```bash
pnpm test:e2e:install
```

Run headless locally (starts dev server on port 5173):

```bash
pnpm test:e2e
```

On Linux CI, system deps are installed separately via `test:e2e:install:deps`.

After editing `messages/pl.json`, recompile Paraglide:

```bash
pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
```

## Architecture Notes

- Static SvelteKit build via `adapter-static`; no SSR and no `+server.ts`
  runtime.
- Supabase client singleton in `src/lib/supabase.ts`.
- Svelte 5 runes and TanStack Query v6 for UI state/server cache.
- User-facing product language is moving toward **Import**, **Transactions**,
  and **Plans**. Some internal files still use `shopping-lists` names for
  compatibility until the data model is renamed.
