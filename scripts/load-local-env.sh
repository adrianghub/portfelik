#!/usr/bin/env bash
# Load local dev env from standard files. Variables already set in the shell win.
#
#   source scripts/load-local-env.sh
#   psql "$SUPABASE_DB_URL" -c 'select 1'
#
# Sourced automatically by check-security-advisors.sh and supabase-ops.sh.

__load_local_env_file() {
  local file="$1"
  local line name value

  [[ -f "$file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue

    name="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    [[ -n "${!name:-}" ]] && continue

    value="${value#"${value%%[![:space:]]*}"}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "$name=$value"
  done <"$file"
}

if [[ -z "${__LOAD_LOCAL_ENV_ROOT:-}" ]]; then
  __LOAD_LOCAL_ENV_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

for __env_file in \
  "$__LOAD_LOCAL_ENV_ROOT/apps/web-svelte/.env.test" \
  "$__LOAD_LOCAL_ENV_ROOT/apps/web-svelte/.env.test.example" \
  "$__LOAD_LOCAL_ENV_ROOT/apps/web-svelte/.env.local" \
  "$__LOAD_LOCAL_ENV_ROOT/apps/web-svelte/.env" \
  "$__LOAD_LOCAL_ENV_ROOT/supabase/.env"; do
  __load_local_env_file "$__env_file"
done
unset __env_file

# Fixed default for `supabase start` (direct Postgres, not the API port).
export SUPABASE_DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
