#!/usr/bin/env bash
# Fail CI when local/prod schema matches Supabase security advisor ERROR patterns we can
# detect in SQL (extension-in-public). Management API get_advisors() is operator-only.
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
    WHERE n.nspname = 'public';
  "
)"

if [[ -n "${PUBLIC_EXTS// }" ]]; then
  echo "SECURITY ADVISOR ERROR: extensions installed in public schema: ${PUBLIC_EXTS}"
  echo "Move them to the extensions schema (see supabase/migrations/20260625000000_pg_net_extensions_schema.sql)."
  exit 1
fi

echo "OK: no extensions in public schema"
