# ADR 0011 — Dedicated Supabase project for staging

**Status:** Accepted (2026-05-22)

Supersedes [ADR 0010](./0010-shared-cf-pages-shared-supabase-staging.md).

## Context

ADR 0010 kept `dev.portfelik.pages.dev` on the production Supabase project so
staging could arrive quickly. That was tolerable while smoke coverage was small.
It is no longer a good default: bank import, shopping-list duplicate detection,
schema/RPC hardening, and upcoming mortgage/debt work all need real Auth,
PostgREST/RLS, Edge Function, and migration verification without staging writes
touching production data.

An external PostgreSQL database would only validate part of the system. The app
also depends on Supabase Auth, REST grants, RPC execution, Vault-backed DB hooks,
Edge Functions, and project-scoped credentials.

## Decision

Keep one Cloudflare Pages project and split Supabase by environment.

- `main` deploys to `portfelik.adrianzinko.com` and uses the production Supabase
  project.
- `dev` deploys to `dev.portfelik.pages.dev` and uses a dedicated free Supabase
  project named `portfelik-staging`.
- Staging migrations run from GitHub Actions before the staging Pages deploy.
  Production migrations remain manually gated until production migration
  tracking is intentionally normalized.
- Staging has synthetic personas and fixture rows only. CI owns one smoke user;
  manual UX verification uses a separate demo user.
- Staging deploys the three Edge Functions for parity. Its DB-to-function hooks
  stay disabled until staging secrets and a staging function base URL are
  deliberately configured.

## Consequences

**Good**

- A migration, seed, smoke run, manual import, or RLS-sensitive test on staging
  no longer mutates production rows.
- Staging keeps the same Supabase surfaces production depends on. It exercises
  more than plain Postgres can.
- `dev` now fails before Pages deploy if staging migrations do not apply.

**Bad**

- Two cloud projects now need credentials, Auth setup, and migration awareness.
- The first staging bootstrap needs one-time project creation, GitHub secret
  wiring, OAuth redirect setup, and a staging migration run.
- A free staging project can pause after inactivity, so a stale staging run may
  need a project wake-up before smoke passes.

**Neutral**

- Cloudflare branch routing does not change.
- Production migration application stays explicit rather than coupling `main`
  pushes to an automatic remote schema change.

## Alternatives considered

- **Shared production Supabase.** Rejected after stabilization work started to
  mutate the same cloud database staging was supposed to protect.
- **Hosted PostgreSQL only.** Rejected because it does not validate Supabase
  Auth, REST/RLS grants, RPCs, Vault hooks, or Edge Functions.
- **Supabase Branching.** Viable later, but not the zero-additional-cost default
  for this app today.
