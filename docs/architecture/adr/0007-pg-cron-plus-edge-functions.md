# ADR 0007 — Hybrid scheduling: pg_cron for SQL, Edge Functions for HTTP

**Status:** Accepted (2026-04, Phase 5)

## Context

The legacy app had five Cloud Functions: three scheduled (recurring transactions, daily status updates, weekly admin summary) and two Firestore triggers (group invitation push, user role sync). Replacing them on Supabase had two obvious shapes:

1. **Everything is an Edge Function.** A weekly cron POSTs to a function; that function reads Postgres, does work, writes back.
2. **Everything is in-database.** `pg_cron` runs SQL; triggers fire SQL; nothing leaves the database.

Neither shape works for this app. Push fan-out needs `web-push` (Deno code, requires the npm `web-push` package). Role sync needs `auth.admin.updateUserById`, which only Service Role JWT can call from Deno. Recurring materialisation, by contrast, is pure SQL — wrapping it in HTTP would be ceremony for nothing.

## Decision

**Hybrid scheduling.**

- **`pg_cron` for SQL-only jobs.** `process_recurring_transactions` (monthly, 1st 23:00 UTC) and `update_transaction_statuses` (daily 05:00 UTC) are scheduled inline. Their bodies are plain plpgsql functions; no HTTP, no external dependencies.
- **Edge Functions for HTTP-needing work.** Three Deno functions:
  - `send-push` — generic VAPID fan-out, triggered by `AFTER INSERT ON notifications`.
  - `send-admin-summary` — weekly aggregation, scheduled via `pg_cron` calling `pg_net.http_post`.
  - `sync-user-role` — mirrors `profiles.role` to `auth.users.app_metadata.role`, triggered by `AFTER UPDATE OF role ON profiles`.
- **`pg_net` is the bridge.** DB triggers and `pg_cron` jobs that need HTTP do `select net.http_post(url := '...', body := ..., headers := ...)`. The bearer secret comes from Supabase Vault (`select decrypted_secret from vault.decrypted_secrets where name = 'internal_trigger_secret'`).

## Consequences

**Good**

- Each piece of work runs in the simplest possible runtime. SQL stays as SQL; Deno only carries the HTTP dimension.
- `pg_cron` jobs are auditable in `cron.job` and `cron.job_run_details`. No external scheduler to monitor.
- The `pg_net` + Vault pattern is one indirection. Once understood, all DB→Edge Function calls follow the same shape.
- Edge Function secrets have a single owner (`INTERNAL_TRIGGER_SECRET`), authenticated by a constant-time string compare. No JWT issuance for trigger calls.

**Bad**

- Two scheduling mechanisms to know about. New work has to choose; the heuristic is "does it need HTTP?"
- `pg_net.http_post` is fire-and-forget by default. A failed Edge Function call writes to `net.http_request_queue` but does not retry the trigger; the notification row is already inserted. We accept this — the in-app bell still works even if push fails.
- Vault secret lifecycle is undocumented (audit item G4).

**Neutral**

- DST: `pg_cron` runs UTC; local Warsaw fire times shift ±1h around DST transitions. Acceptable.

## Alternatives considered

- **All Edge Functions.** Would force HTTP indirection for jobs that are pure SQL. More moving parts, more places to read logs, more places where retries can be wrong.
- **All `pg_cron` + plpgsql.** Cannot make outbound HTTP requests with the encryption needed for VAPID; cannot call the Supabase Admin Auth API. Rules out the push and role-sync paths.
- **External cron (GitHub Actions, Cloudflare Workers Cron).** Adds a fourth runtime, a fourth place secrets live, and a fourth thing to monitor. The whole point of `pg_cron` is that the scheduler lives where the data lives.
