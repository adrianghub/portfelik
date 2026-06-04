# Portfelik Architecture

This directory describes how Portfelik is built today and where the technical
model is intentionally evolving. Product direction lives in
[`../product/product-direction.md`](../product/product-direction.md).

Last reviewed: **2026-06-04**.

## Reading Order

1. [`../product/product-direction.md`](../product/product-direction.md) -
   import-first product spine and plan settlement direction.
2. [`overview.md`](./overview.md) - system context, app structure, services, and
   cross-cutting patterns.
3. [`database.md`](./database.md) - current schema, RLS strategy, RPCs,
   migrations, and compatibility notes.
4. [`flows/`](./flows/) - current critical workflows:
   - [`auth.md`](./flows/auth.md)
   - [`transaction-crud.md`](./flows/transaction-crud.md)
   - [`plan-settlement.md`](./flows/plan-settlement.md)
   - [`notifications-push.md`](./flows/notifications-push.md)
   - [`recurring-transactions.md`](./flows/recurring-transactions.md)
5. [`env-workflow.md`](./env-workflow.md) - local, staging, and production
   workflow.
6. [`adr/`](./adr/) - architectural decisions and rationale.

## What Lives Where

| Artefact | Location |
| --- | --- |
| Frontend SPA | `apps/web-svelte/` |
| Database migrations | `supabase/migrations/` |
| Edge Functions | `supabase/functions/` |
| Product docs | `docs/product/` |
| Architecture docs | `docs/architecture/` |
| Runbooks | `docs/runbooks/` |
| CI/CD | `.github/workflows/` |
| Agent guidance | `CLAUDE.md`, `AGENTS.md`, `.agents/skills/` |

## One-Paragraph Summary

Portfelik is a static SvelteKit SPA hosted on Cloudflare Pages. It talks
directly to Supabase Auth, PostgREST, and SECURITY DEFINER RPCs. Postgres is the
source of truth; Row-Level Security owns authorization. Bank import stores
owner-only provenance separately from shared transaction rows. User-facing Plans
currently sit on `shopping_lists` compatibility storage, with the product
direction moving toward plan-to-transaction settlement links.
