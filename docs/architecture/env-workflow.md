# Environment workflow — local → staging → prod

How code and data move from a dev laptop to the live site, and what each tier actually targets.

Last reviewed: **2026-05-22**.

## TL;DR

| Tier           | Trigger                              | Hosts on                    | DB target                                          |
| -------------- | ------------------------------------ | --------------------------- | -------------------------------------------------- |
| **Local**      | `pnpm dev` (from `apps/web-svelte/`) | `127.0.0.1:5173`            | **Local Supabase stack** (`127.0.0.1:54321`)       |
| **Staging**    | `git push origin dev`                | `dev.portfelik.pages.dev`   | **Dedicated `portfelik-staging` Supabase project** |
| **Production** | `git push origin main`               | `portfelik.adrianzinko.com` | **Prod Supabase project**                          |

Cloudflare Pages still splits by branch inside one Pages project. Supabase does
not: staging and production now have separate projects, credentials, Auth users,
and migration targets.

## Flow diagram

```mermaid
flowchart LR
  subgraph local["Local dev"]
    devCmd["pnpm dev"] --> envLocal[".env.local<br/>PUBLIC_SUPABASE_URL=127.0.0.1:54321"]
    envLocal --> localStack["Local Supabase stack<br/>(docker via supabase start)"]
  end

  subgraph staging["Staging (dev branch)"]
    pushDev["git push origin dev"] --> ghaDevMigrate["GH Actions<br/>migrate-staging job"]
    ghaDevMigrate -->|supabase db push<br/>+ seed-staging.mjs| supaStage
    ghaDevMigrate --> ghaDev["GH Actions<br/>deploy-staging job"]
    ghaDev -->|wrangler pages deploy<br/>--branch dev| cfPagesDev["Cloudflare Pages<br/>dev.portfelik.pages.dev"]
    ghaDev -->|secrets.STAGING_PUBLIC_SUPABASE_URL| supaStage
  end

  subgraph prod["Production (main branch)"]
    pushMain["git push origin main"] --> ghaProd["GH Actions<br/>deploy-prod job"]
    ghaProd -->|wrangler pages deploy<br/>--branch main| cfPagesProd["Cloudflare Pages<br/>portfelik.adrianzinko.com"]
    ghaProd -->|secrets.PUBLIC_SUPABASE_URL| supaProd
  end

  supaStage["Supabase Cloud<br/>portfelik-staging"]
  supaProd["Supabase Cloud<br/>production<br/>emqzcygfwcvbmhxhfkcc.supabase.co"]
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

- Branch: `dev`. Push triggers `.github/workflows/cloudflare-deploy.yml`.
- `migrate-staging` links the `portfelik-staging` project, runs
  `supabase db push --linked --include-seed`, deploys the three Edge Functions,
  then runs `pnpm seed:staging`.
- Staging build env vars come only from `STAGING_*` secrets:
  `STAGING_PUBLIC_SUPABASE_URL`, `STAGING_PUBLIC_SUPABASE_ANON_KEY`, and
  `STAGING_PUBLIC_VAPID_KEY`. Workflow guards fail if the staging project ref or
  URL equals production.
- `cloudflare/wrangler-action@v3` runs `pages deploy build --branch dev` against project `portfelik`.
- Lands at `https://dev.portfelik.pages.dev`.
- After deploy: real-DB smoke job (`smoke`) runs Playwright against staging URL
  using `STAGING_E2E_SMOKE_EMAIL` / `STAGING_E2E_SMOKE_PASSWORD`. Smoke data is
  tagged `__e2e_smoke__` in `description` and cleaned up idempotently per run.
- `apps/web-svelte/scripts/seed-staging.mjs` owns the synthetic manual-testing
  persona. It rewrites only `Demo:`-tagged fixture rows for the configured demo
  user; it never copies production data.

### Production

- Branch: `main`. Push triggers `deploy-prod` job in the same workflow.
- Production build secrets keep the unprefixed names:
  `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, and `PUBLIC_VAPID_KEY`.
- `wrangler pages deploy build --branch main`. Lands at `https://portfelik.adrianzinko.com`.
- No automatic post-deploy verification — relies on staging smoke having passed.

## Migrations

```mermaid
flowchart LR
  newSql["new file in<br/>supabase/migrations/"] --> ghaStage["dev push<br/>migrate-staging"]
  ghaStage --> supaStage2["Staging Supabase"]
  newSql --> prodGate["reviewed manual<br/>prod apply"]
  prodGate --> supaProd2["Production Supabase"]
  newSql --> localReset["supabase db reset<br/>(manual, local only)"]
  localReset --> localPg["Local Postgres"]
```

- Files in `supabase/migrations/` are canonical. Naming: `YYYYMMDDHHMMSS_short_slug.sql`.
- **Never amend an applied migration.** Add a new one.
- Applied to staging by the `migrate-staging` workflow on `dev` before the Pages
  deploy. A schema failure blocks staging deploy and smoke.
- Applied to production manually after staging verification. Use the explicit
  prod-scoped Supabase MCP/CLI target; production migration tracking still has
  early-history caveats documented in `supabase/CLAUDE.md`.
- Applied locally by `supabase db reset` (runs every file in order, then `seed.sql`).
- `seed.sql` is the common system seed. `pnpm seed:staging` adds only synthetic
  cloud staging personas and fixture rows.

## Common pitfalls

| Symptom                                                      | Likely cause                                                                                                                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local dev writes appear in prod data                         | `.env.local` still points to cloud. Check first line; rewrite from `.env.example`.                                                                               |
| `supabase db reset` fails with "extension already exists"    | Harmless `NOTICE`. Migrations are written idempotently.                                                                                                          |
| Staging "works on my machine" but breaks before Pages deploy | Staging migration push failed or a staging secret targets prod. Inspect `migrate-staging` before debugging the frontend.                                         |
| Cloudflare Pages env vars stale after rotation               | GH Actions injects build-time vars; **the Pages project's UI vars are unused**. Rotate via GH repo secrets.                                                      |
| MCP writes hit prod by surprise                              | Use explicit MCP names. `.mcp.json` separates `supabase-prod`, temporary `supabase-account`, and the staging project-scoped entry once the staging ref is known. |

## One-time staging bootstrap

1. Create `portfelik-staging` with Data API enabled and automatic table exposure
   disabled. Keep the generated database password.
2. Configure GitHub Staging secrets:
   `STAGING_SUPABASE_ACCESS_TOKEN`, `STAGING_SUPABASE_DB_PASSWORD`,
   `STAGING_SUPABASE_PROJECT_REF`, `STAGING_PUBLIC_SUPABASE_URL`,
   `STAGING_PUBLIC_SUPABASE_ANON_KEY`, `STAGING_PUBLIC_VAPID_KEY`,
   `STAGING_SUPABASE_SERVICE_ROLE_KEY`, `STAGING_E2E_SMOKE_EMAIL`,
   `STAGING_E2E_SMOKE_PASSWORD`, `STAGING_DEMO_EMAIL`, and
   `STAGING_DEMO_PASSWORD`.
3. Enable Google OAuth on staging, add the staging Pages callback/redirect URLs,
   keep email/password available for seeded personas, and disable public
   sign-up.
4. Add a `supabase-staging` project-scoped MCP entry after the staging project
   ref is known. Keep `supabase-account` only for account/project work.
5. Let the next `dev` push migrate and seed staging. Verify browser network
   calls point at the staging Supabase URL before promoting `dev` to `main`.

## Backlog

- Normalize production migration-history drift before considering automatic
  production `supabase db push`.
- Decide when staging should enable real DB hook dispatch by configuring the
  staging Vault `edge_functions_base_url`, matching Edge Function
  `INTERNAL_TRIGGER_SECRET`, and VAPID secrets.
