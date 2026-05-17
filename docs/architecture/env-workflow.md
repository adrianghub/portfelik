# Environment workflow — local → staging → prod

How code and data move from a dev laptop to the live site, and what each tier actually targets.

Last reviewed: **2026-05-15**.

## TL;DR

| Tier | Trigger | Hosts on | DB target |
|---|---|---|---|
| **Local** | `pnpm dev` (from `apps/web-svelte/`) | `127.0.0.1:5173` | **Local Supabase stack** (`127.0.0.1:54321`) |
| **Staging** | `git push origin dev` | `dev.portfelik.pages.dev` | **Prod Supabase project** (RLS-isolated test user) |
| **Production** | `git push origin main` | `portfelik.adrianzinko.com` | **Prod Supabase project** |

Staging and prod share one Supabase project. Isolation is RLS-only. Separating staging to its own Supabase project is backlog.

## Flow diagram

```mermaid
flowchart LR
  subgraph local["Local dev"]
    devCmd["pnpm dev"] --> envLocal[".env.local<br/>PUBLIC_SUPABASE_URL=127.0.0.1:54321"]
    envLocal --> localStack["Local Supabase stack<br/>(docker via supabase start)"]
  end

  subgraph staging["Staging (dev branch)"]
    pushDev["git push origin dev"] --> ghaDev["GH Actions<br/>deploy-staging job"]
    ghaDev -->|wrangler pages deploy<br/>--branch dev| cfPagesDev["Cloudflare Pages<br/>dev.portfelik.pages.dev"]
    ghaDev -->|secrets.PUBLIC_SUPABASE_URL| supaCloud
  end

  subgraph prod["Production (main branch)"]
    pushMain["git push origin main"] --> ghaProd["GH Actions<br/>deploy-prod job"]
    ghaProd -->|wrangler pages deploy<br/>--branch main| cfPagesProd["Cloudflare Pages<br/>portfelik.adrianzinko.com"]
    ghaProd -->|secrets.PUBLIC_SUPABASE_URL| supaCloud
  end

  supaCloud["Supabase Cloud<br/>emqzcygfwcvbmhxhfkcc.supabase.co<br/>(prod + staging DB)"]

  classDef warn fill:#fee,stroke:#c33;
  class supaCloud warn;
```

## Tier details

### Local

- Config: `apps/web-svelte/.env.local`.
- After the local-stack switch (2026-05-15), `.env.local` points at the local Supabase stack.
- Stack boot (from repo root): `supabase start`. Stops with `supabase stop`. Resets schema + re-applies all migrations: `supabase db reset`.
- Studio at `http://127.0.0.1:54323`. DB direct: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- Cloud creds stashed in `apps/web-svelte/.env.cloud.local` (gitignored). Swap in when you need to reproduce a real-user bug: `cp .env.cloud.local .env.local && pnpm dev`.
- Google OAuth doesn't work against the local stack. Seed a test user in Studio → Authentication → Add User, with email/password.

### Staging

- Branch: `dev`. Push triggers `.github/workflows/cloudflare-deploy.yml` → `deploy-staging` job (lines ~180–210).
- Build env vars passed to `pnpm build`: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_VAPID_KEY` — all from repo secrets, **identical to prod**.
- `cloudflare/wrangler-action@v3` runs `pages deploy build --branch dev` against project `portfelik`.
- Lands at `https://dev.portfelik.pages.dev`.
- After deploy: real-DB smoke job (`smoke`) runs Playwright against staging URL using `E2E_SMOKE_EMAIL` / `E2E_SMOKE_PASSWORD` credentials. Smoke data is tagged `__e2e_smoke__` in `description` and cleaned up idempotently per run.

### Production

- Branch: `main`. Push triggers `deploy-prod` job in the same workflow.
- Same build env vars (same secret names).
- `wrangler pages deploy build --branch main`. Lands at `https://portfelik.adrianzinko.com`.
- No automatic post-deploy verification — relies on staging smoke having passed.

## Migrations

```mermaid
flowchart LR
  newSql["new file in<br/>supabase/migrations/"] --> mcp["MCP apply_migration<br/>(manual)"]
  mcp --> supaCloud2["Supabase Cloud<br/>(prod + staging DB)"]
  newSql --> localReset["supabase db reset<br/>(manual, local only)"]
  localReset --> localPg["Local Postgres"]
```

- Files in `supabase/migrations/` are canonical. Naming: `YYYYMMDDHHMMSS_short_slug.sql`.
- **Never amend an applied migration.** Add a new one.
- Applied to cloud via Supabase MCP `apply_migration`. Cloud tracking lives in `supabase_migrations.schema_migrations` (some early entries un-imported — see `supabase/CLAUDE.md` "Migration tracking" note).
- Applied locally by `supabase db reset` (runs every file in order, then `seed.sql`).
- No automated migration step in GH Actions today. Cloud migration is a manual step the dev runs before pushing the code that depends on it.

## Common pitfalls

| Symptom | Likely cause |
|---|---|
| Local dev writes appear in prod data | `.env.local` still points to cloud. Check first line; rewrite from `.env.example`. |
| `supabase db reset` fails with "extension already exists" | Harmless `NOTICE`. Migrations are written idempotently. |
| Staging "works on my machine" but breaks differently than prod | Identical infra except RLS-test-user — most likely cause is a migration applied locally but not yet to cloud. Run `supabase migration list` against the linked project. |
| Cloudflare Pages env vars stale after rotation | GH Actions injects build-time vars; **the Pages project's UI vars are unused**. Rotate via GH repo secrets. |
| MCP writes hit prod by surprise | The MCP server connects to the cloud project (see `.mcp.json`). Treat it as a prod console. For local DB queries, use `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres` directly. |

## Backlog

- **Separate cloud Supabase project for staging.** Today staging shares prod DB; only RLS protects prod data from staging activity. A dedicated `portfelik-staging` Supabase project would mirror migrations, get its own anon key (staging-only GH secret pair), and remove the RLS-only safety net. Cost: ~free on the Supabase free tier for small data sizes; setup work: ~1 hour (clone migrations, env vars, smoke creds).
- **Automated migrations in CI.** Today migrations are applied manually via MCP. A `supabase db push` step in the deploy workflow (against staging first, then prod after manual approval) would close the drift window.
