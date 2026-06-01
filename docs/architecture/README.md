# Portfelik - Architecture

Portfelik is a personal-finance PWA. This directory is the canonical reference for how the system is built **today**. It complements `MIGRATION_PLAN.md` (which is the historical record of *how we got here*) and `CLAUDE.md` (which tracks live work).

Last reviewed: **2026-05-09** ([audit report](./audit-2026-05-09.md)).

## Reading order

If you are new to the project (or a new Claude session needs to cold-start), read in this order:

1. **[`overview.md`](./overview.md)** - system context, containers, components, tech stack, cross-cutting patterns.
2. **[`database.md`](./database.md)** - tables, ER diagram, RLS strategy, RPCs, triggers, migration timeline.
3. **[`flows/`](./flows/)** - end-to-end sequence diagrams for the critical user journeys:
   - [`auth.md`](./flows/auth.md) - Google OAuth and JWT role propagation
   - [`transaction-crud.md`](./flows/transaction-crud.md) - create/update/delete + summary computation
   - [`shopping-list-complete.md`](./flows/shopping-list-complete.md) - complete-list-to-transaction RPC
   - [`notifications-push.md`](./flows/notifications-push.md) - DB trigger → Edge Function → VAPID push
   - [`recurring-transactions.md`](./flows/recurring-transactions.md) - pg_cron monthly materialization
4. **[`env-workflow.md`](./env-workflow.md)** - local → staging → prod plumbing: what each tier deploys, what DB each one targets, how migrations propagate.
5. **[`adr/`](./adr/)** - architecture decision records explaining *why* the system looks the way it does.

All diagrams are written in **Mermaid** and render natively on GitHub.

## What lives where

| Artefact | Location |
|---|---|
| Frontend (SvelteKit SPA) | `apps/web-svelte/` |
| Database migrations | `supabase/migrations/` |
| Edge Functions (Deno) | `supabase/functions/` |
| Local dev config | `supabase/config.toml` |
| Seed data | `supabase/seed.sql` |
| CI/CD | `.github/workflows/` |
| Migration history | `MIGRATION_PLAN.md` |
| Live work tracker | `CLAUDE.md` |
| **Architecture (this dir)** | `docs/architecture/` |

## One-paragraph summary

A static SvelteKit SPA is hosted on Cloudflare Pages and talks directly to Supabase (Postgres + Auth + Edge Functions). Authorisation is enforced exclusively by Postgres Row-Level Security; group-membership-managed tables (`user_groups`, `group_members`, `group_invitations`) block direct writes and expose mutations through SECURITY DEFINER RPCs. Scheduled work (recurring transaction materialisation, status flips, weekly admin summary) runs in `pg_cron`; HTTP-needing work (web-push fan-out, role-claim sync, summary dispatch) runs in three Deno Edge Functions, called from DB triggers via `pg_net.http_post` with a Vault-stored shared secret. Push notifications use raw VAPID web-push (no Firebase). The legacy React+Firebase implementation was deleted at commit `f3d115a` (2026-05-01); this document is the source of truth from that point forward.
