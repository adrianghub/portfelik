# ADR 0002 - Replace Firebase with Supabase

**Status:** Accepted (2026-03 migration)

## Context

The legacy app ran on Firebase: Firestore (7 collections), Cloud Functions (5 functions, Node 22, `europe-central2`), Firebase Auth (Google OAuth), FCM, Firebase Hosting. Firestore's document model fit the app's earliest shape but turned into friction as relational use cases grew (group sharing, recurring transactions, monthly summaries computed by a separate Go BFF). Cloud Functions cold-starts and the proliferation of small ad-hoc indexes added more drag.

We needed a backend that supported:

- relational queries with proper joins (group-shared transactions),
- a per-row authorisation engine that wasn't a separate rules language,
- in-database scheduling for recurring jobs,
- HTTP webhooks for tasks needing JS,
- and a managed offering with an EU region and a free tier large enough for a personal app.

## Decision

Migrate to **Supabase Cloud (EU region)**. Postgres replaces Firestore; PostgREST replaces the read side of the Go BFF; RLS replaces `firestore.rules`; `pg_cron` replaces three of the five Cloud Functions; Supabase Edge Functions (Deno) replace the remaining two; GoTrue replaces Firebase Auth.

## Consequences

**Good**

- One database with one query language. The Go BFF (which existed only to do a SQL-shaped fan-out across `users.groupIds[]`) goes away; the equivalent is a one-line RLS predicate over `group_members`.
- RLS is data-local. Authorisation lives next to the table, evaluated by the engine, visible to `EXPLAIN`. Easier to audit than `firestore.rules`.
- `pg_cron` is in-DB scheduling with no extra runtime. SQL-only jobs (recurring materialisation, status flips) are pure SQL.
- JWT-based auth claims replace Firebase custom claims, with the same semantics (`app_metadata.role`).
- VAPID web-push (a separate decision; see ADR 0005) drops the Firebase Messaging SDK from the bundle.
- Vendor portability - Postgres + PostgREST + GoTrue can be self-hosted on the existing Pi homelab if Supabase pricing or sovereignty ever forces a move.

**Bad**

- Loss of Firestore's offline cache. We accepted this for reads (TanStack Query + `networkMode: offlineFirst`) and deferred writes (audit item G1; legacy queue not yet ported).
- `pg_net` + Vault + DB triggers calling Edge Functions is a new mental model that took one phase to settle (migration `20260425000001`).
- One vendor swapped for another. Supabase is mature but smaller than Google Cloud.

**Neutral**

- A re-keying step at cutover (Firebase UID → Supabase UID). Solved by making cutover a clean re-account: users sign in with Google, a fresh `auth.users` row is created, old data was not migrated. Personal app, low volume, accepted.

## Alternatives considered

- **Self-host on the Pi (`bastion-homelab`).** The Pi has 8GB RAM and 14 services; a full Supabase stack would push it. Self-hosting a subset (postgres + postgrest + gotrue, ~800MB steady) remains an escape hatch if Supabase costs or sovereignty ever force a move.
- **Stay on Firebase, fix the friction.** Would have required a JOIN-shaped fan-out worker (the Go BFF), per-collection indexing strategies, and continued maintenance of the rules language. Doesn't fix the core mismatch.
- **PlanetScale / Neon + custom Auth.** Closer to "just Postgres" but loses the bundled Auth + Edge Functions + Realtime + Storage + Studio that Supabase ships together; we'd reassemble those by hand.
