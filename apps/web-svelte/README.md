# JakStoimy — web app

SvelteKit SPA for JakStoimy. Repo setup and product pitch:
[root README](../../README.md).

```bash
pnpm install && pnpm dev
```

Local stack from repo root: `supabase start && supabase db reset`, then
`pnpm seed:local` here.

| | |
| --- | --- |
| `pnpm check` | svelte-check |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm test:unit` | unit |
| `pnpm test:e2e` | Playwright (mocked) |
| `pnpm test:e2e:install` | browsers if missing after upgrade |

After `messages/pl.json`: recompile Paraglide
(`pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`).

Static `adapter-static` build, Supabase client in `src/lib/supabase.ts`,
Svelte 5 + TanStack Query. Spine: **Kokpit**, **Transakcje**, **Plany**,
**Ustawienia**.
