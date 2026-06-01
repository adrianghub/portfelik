# ADR 0010 - Shared Cloudflare Pages project + shared Supabase project for prod & staging

**Status:** Superseded by [ADR 0011](./0011-dedicated-supabase-staging-project.md) (2026-05-22)

## Context

Phase 8 added a staging environment for verifying changes (and running real-DB smoke tests) before they ship to production. The conventional model is: separate Cloudflare Pages projects, separate Supabase projects, per-environment secrets, per-environment domains.

For a single-developer, single-user-soon-to-be-low-double-digit-users personal app, that conventional model is heavy. It doubles every secret, doubles every dashboard, doubles every migration push, and creates drift opportunities (a migration applied on prod but not staging is a real failure mode).

We need _some_ isolation though - staging writes must not pollute prod data, and a destructive smoke test cannot wipe real users' shopping lists.

## Decision

**Share both the Cloudflare Pages project and the Supabase project across prod and staging. Isolate by branch + RLS-tagged data.**

- One Cloudflare Pages project: `portfelik`.
  - `main` branch deploys to `portfelik.adrianzinko.com`.
  - `dev` branch deploys to `dev.portfelik.pages.dev`.
- One Supabase Cloud project. Both deployments hit the same database with the same publishable anon key.
- A **dedicated test user** exists in `auth.users` with an explicitly-enabled email/password credential (the rest of the world signs in via Google OAuth only). The smoke suite signs in as this user.
- Smoke-test data is **tagged**: every transaction the suite creates has `description` prefixed with `__e2e_smoke__`. The suite's `beforeAll`/`afterAll` deletes by `description LIKE '__e2e_smoke__%'` for that user - idempotent cleanup.
- RLS prevents the smoke user from seeing or touching any other user's data, period.
- GH secrets `E2E_SMOKE_EMAIL` and `E2E_SMOKE_PASSWORD` are shared between prod and dev workflows; the smoke job runs only after a successful `dev` deploy.

## Consequences

**Good**

- One database to migrate, one to monitor, one set of secrets to manage.
- Migrations applied to staging are also applied to prod; drift is structurally impossible.
- Staging smoke runs against the _real_ database engine, the real RLS, the real Edge Functions - not a mock that can lie.
- Deploy ergonomics are simple: push to `dev` to land on staging; merge `dev` → `main` to land on prod.

**Bad**

- A bad migration affects both environments simultaneously. Mitigation: migrations are reviewed, applied during low-traffic windows, and the database has Supabase's automatic point-in-time recovery as a safety net. (See audit item - restore runbook is missing.)
- The smoke user's existence widens the auth surface (email/password is enabled at the project level). Mitigation: public sign-up is **disabled** in `config.toml`; only Supabase-Dashboard-created users can use email/password, and only the smoke user has a password set.
- A misbehaving smoke run could write data outside its sentinel prefix. Mitigation: the suite uses a single helper to construct descriptions; a typo would fail the cleanup, but RLS limits the blast radius to the smoke user.

**Neutral**

- We accept that any data tagged `__e2e_smoke__` belongs to the suite and may be deleted at any time.

## Alternatives considered

- **Separate Supabase project for staging.** Industry-standard, but for a personal app with low traffic the operational overhead (two projects to migrate, two sets of secrets, two storage backups, drift risk) outweighs the safety. The shared-project + tagged-data approach gives equivalent isolation for our threat model (a single-developer team).
- **Same project, separate schema (e.g. `staging`).** Awkward - would require schema-aware RLS or duplicating every policy. Not idiomatic in PostgREST.
- **Supabase branching.** Was newer than we wanted to bet on at Phase 8 cutover. Worth revisiting if the project grows or the smoke suite expands.
