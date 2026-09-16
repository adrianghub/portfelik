# JakStoimy web app

SvelteKit SPA for JakStoimy. Product pitch, clone steps, and branch model:
[root README](../../README.md).

```bash
pnpm install && pnpm seed:local && pnpm dev
```

Local stack from repo root first: `supabase start && supabase db reset`.

| | |
| --- | --- |
| `pnpm check` | svelte-check |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm test:unit` | unit |
| `pnpm test:e2e` | Playwright (mocked) |
| `pnpm test:e2e:install` | browsers if missing after upgrade |
| `pnpm android:sync` | production-shaped web build + Capacitor Android sync |

After `messages/pl.json`: recompile Paraglide
(`pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`).

Static `adapter-static` build, Supabase client in `src/lib/supabase.ts`,
Svelte 5 + TanStack Query. Main nav: **Kokpit**, **Transakcje**, **Plany**.
**Import** is a flow, not a nav item. Play Internal:
[docs/runbooks/play-internal.md](../../docs/runbooks/play-internal.md).
