# Architecture Decision Records

MADR-lite format. Each record:

- **Status** — one of `Accepted`, `Superseded`, `Deprecated`. None are `Proposed` here — these are records of decisions already in production.
- **Context** — what was the situation; what problem prompted the decision.
- **Decision** — what we chose.
- **Consequences** — good, bad, neutral.
- **Alternatives considered** — what we did not pick and why.

Records are append-only. To revise, write a new ADR that supersedes the old one and update both `Status` lines.

## Index

| # | Title | Status |
|---|---|---|
| [0001](./0001-svelte5-runes.md) | Adopt Svelte 5 runes (no stores) | Accepted |
| [0002](./0002-supabase-over-firebase.md) | Replace Firebase with Supabase | Accepted |
| [0003](./0003-rls-first-with-security-definer-rpcs.md) | RLS-first design with SECURITY DEFINER RPCs for membership-managed tables | Accepted |
| [0004](./0004-paraglide-over-i18next.md) | Paraglide v2 instead of i18next | Accepted |
| [0005](./0005-vapid-replaces-fcm.md) | VAPID web-push instead of FCM | Accepted |
| [0006](./0006-cloudflare-pages-static-adapter.md) | Cloudflare Pages with `adapter-static` | Accepted |
| [0007](./0007-pg-cron-plus-edge-functions.md) | Hybrid scheduling — pg_cron for SQL, Edge Functions for HTTP | Accepted |
| [0008](./0008-tanstack-query-with-svelte5-runes.md) | TanStack Query v6 with Svelte 5 runes | Accepted |
| [0009](./0009-no-onsnapshot-realtime.md) | No Realtime — staleTime polling is enough | Accepted |
| [0010](./0010-shared-cf-pages-shared-supabase-staging.md) | Shared Cloudflare Pages project + shared Supabase project for prod & staging | Accepted |
