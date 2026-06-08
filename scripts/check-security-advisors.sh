#!/usr/bin/env bash
# Regression gate for Supabase advisor 0014 (extension-in-public) on the local CI
# stack. Management API get_advisors() is operator-only on hosted projects.
#
# Extensions our migrations install without an explicit schema:
#   20260423000000_initial_schema.sql  → pgcrypto, pg_cron
#   20260425000000_phase5_*.sql        → pg_net
#
# On `supabase start` (CI), pgcrypto/pg_net land in `extensions` and pg_cron in
# `pg_catalog` - not `public`. We only fail when pgcrypto regresses into public
# (actionable via WITH SCHEMA / SET SCHEMA).
#
# Intentionally NOT gated here:
#   pg_net  - hosted Supabase rejects ALTER EXTENSION ... SET SCHEMA (0A000);
#             re-enable via Dashboard → Database → Extensions if advisor persists.
#   pg_cron - managed stacks install it into pg_catalog, not public.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=load-local-env.sh
source "$ROOT_DIR/scripts/load-local-env.sh"

DB_URL="${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"

PUBLIC_EXTS="$(
  psql "$DB_URL" -tAc "
    SELECT coalesce(string_agg(e.extname, ', ' ORDER BY e.extname), '')
    FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE n.nspname = 'public'
      AND e.extname IN ('pgcrypto');
  "
)"

if [[ -n "${PUBLIC_EXTS// }" ]]; then
  echo "SECURITY ADVISOR REGRESSION: app extension(s) in public schema: ${PUBLIC_EXTS}"
  echo "Recreate with WITH SCHEMA extensions or ALTER EXTENSION ... SET SCHEMA extensions."
  exit 1
fi

echo "OK: migration-installed extensions are not in public (pgcrypto)"
