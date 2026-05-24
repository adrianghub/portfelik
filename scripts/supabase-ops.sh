#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/supabase/.env"
TYPES_FILE="$ROOT_DIR/apps/web-svelte/src/lib/supabase.types.ts"
EDGE_FUNCTIONS=(send-push send-admin-summary sync-user-role)

load_env_file() {
  local line
  local name
  local value

  [[ -f "$ENV_FILE" ]] || return

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue

    name="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    declare -p "$name" >/dev/null 2>&1 && continue

    value="${value#"${value%%[![:space:]]*}"}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "$name=$value"
  done <"$ENV_FILE"
}

load_env_file

usage() {
  cat <<'EOF'
Usage:
  ./scripts/supabase-ops.sh local <start|stop|status|reset|seed|advisors|types>
  ./scripts/supabase-ops.sh migration new <slug>
  ./scripts/supabase-ops.sh <staging|prod> <link|migrations|push-preview|push|advisors|functions> [--confirm <target>]
  ./scripts/supabase-ops.sh <staging|prod> repair-applied <version> [<version> ...] --confirm <target>
  ./scripts/supabase-ops.sh staging seed --confirm staging

Remote mutations require an exact confirmation flag:
  ./scripts/supabase-ops.sh staging push --confirm staging
  ./scripts/supabase-ops.sh prod repair-applied 20260423000000 --confirm prod
  ./scripts/supabase-ops.sh prod functions --confirm prod

Remote project refs/passwords and staging seed credentials load from
supabase/.env when present. Supabase CLI login/profile or SUPABASE_ACCESS_TOKEN
must already provide API access for remote commands.
EOF
}

die() {
  printf 'supabase-ops: %s\n' "$*" >&2
  exit 1
}

need_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || die "missing $name in the shell or supabase/.env"
}

need_confirmation() {
  local target="$1"
  shift

  [[ "${1:-}" == "--confirm" && "${2:-}" == "$target" && "$#" -eq 2 ]] ||
    die "$target mutation requires: --confirm $target"
}

target_ref_var() {
  case "$1" in
    staging) printf 'STAGING_SUPABASE_PROJECT_REF\n' ;;
    prod) printf 'PROD_SUPABASE_PROJECT_REF\n' ;;
    *) die "remote target must be staging or prod" ;;
  esac
}

target_password_var() {
  case "$1" in
    staging) printf 'STAGING_SUPABASE_DB_PASSWORD\n' ;;
    prod) printf 'PROD_SUPABASE_DB_PASSWORD\n' ;;
    *) die "remote target must be staging or prod" ;;
  esac
}

link_remote() {
  local target="$1"
  local ref_var
  local password_var

  ref_var="$(target_ref_var "$target")"
  password_var="$(target_password_var "$target")"
  need_env "$ref_var"
  need_env "$password_var"

  supabase link \
    --project-ref "${!ref_var}" \
    --password "${!password_var}" \
    --workdir "$ROOT_DIR"
}

deploy_functions() {
  local target="$1"
  local ref_var
  local function_name

  ref_var="$(target_ref_var "$target")"
  need_env "$ref_var"

  for function_name in "${EDGE_FUNCTIONS[@]}"; do
    supabase functions deploy "$function_name" \
      --project-ref "${!ref_var}" \
      --workdir "$ROOT_DIR"
  done
}

push_remote() {
  local target="$1"
  shift

  if [[ "$target" == "staging" ]]; then
    supabase db push --linked --include-seed "$@" --workdir "$ROOT_DIR"
  else
    supabase db push --linked "$@" --workdir "$ROOT_DIR"
  fi
}

repair_applied_remote() {
  local target="$1"
  shift
  local versions=()

  while [[ "$#" -gt 0 && "${1:-}" != "--confirm" ]]; do
    [[ "$1" =~ ^[0-9]{14}$ ]] ||
      die "repair-applied versions must be 14-digit migration timestamps"
    versions+=("$1")
    shift
  done

  [[ "${#versions[@]}" -gt 0 ]] ||
    die "$target repair-applied requires one or more migration versions"

  need_confirmation "$target" "$@"
  link_remote "$target"
  supabase migration repair "${versions[@]}" \
    --status applied \
    --linked \
    --yes \
    --workdir "$ROOT_DIR"
}

run_local() {
  local operation="${1:-}"
  shift || true
  [[ "$#" -eq 0 ]] || die "local $operation does not accept extra arguments"

  case "$operation" in
    start) supabase start --workdir "$ROOT_DIR" ;;
    stop) supabase stop --workdir "$ROOT_DIR" ;;
    status) supabase status --workdir "$ROOT_DIR" ;;
    reset) supabase db reset --local --workdir "$ROOT_DIR" ;;
    seed)
      (
        cd "$ROOT_DIR/apps/web-svelte"
        pnpm seed:local
      )
      ;;
    advisors) supabase db advisors --local --workdir "$ROOT_DIR" ;;
    types)
      supabase gen types typescript --local --workdir "$ROOT_DIR" >"$TYPES_FILE"
      printf 'Wrote %s\n' "$TYPES_FILE"
      ;;
    help | -h | --help | '') usage ;;
    *) die "unknown local operation: $operation" ;;
  esac
}

run_migration() {
  local operation="${1:-}"
  local slug="${2:-}"
  shift 2 || true

  [[ "$operation" == "new" ]] || die "migration supports only: new <slug>"
  [[ -n "$slug" ]] || die "migration new requires a slug"
  [[ "$#" -eq 0 ]] || die "migration new accepts one slug only"

  supabase migration new "$slug" --workdir "$ROOT_DIR"
}

seed_staging() {
  local name
  for name in \
    STAGING_SUPABASE_URL \
    STAGING_SUPABASE_SERVICE_ROLE_KEY \
    STAGING_DEMO_EMAIL \
    STAGING_DEMO_PASSWORD \
    STAGING_E2E_SMOKE_EMAIL \
    STAGING_E2E_SMOKE_PASSWORD; do
    need_env "$name"
  done

  (
    cd "$ROOT_DIR/apps/web-svelte"
    pnpm seed:staging
  )
}

run_remote() {
  local target="$1"
  local operation="${2:-}"
  shift 2 || true

  case "$operation" in
    link)
      [[ "$#" -eq 0 ]] || die "$target link does not accept extra arguments"
      link_remote "$target"
      ;;
    migrations)
      [[ "$#" -eq 0 ]] || die "$target migrations does not accept extra arguments"
      link_remote "$target"
      supabase migration list --linked --workdir "$ROOT_DIR"
      ;;
    push-preview)
      [[ "$#" -eq 0 ]] || die "$target push-preview does not accept extra arguments"
      link_remote "$target"
      push_remote "$target" --dry-run
      ;;
    push)
      need_confirmation "$target" "$@"
      link_remote "$target"
      push_remote "$target" --yes
      ;;
    repair-applied)
      repair_applied_remote "$target" "$@"
      ;;
    advisors)
      [[ "$#" -eq 0 ]] || die "$target advisors does not accept extra arguments"
      link_remote "$target"
      supabase db advisors --linked --workdir "$ROOT_DIR"
      ;;
    functions)
      need_confirmation "$target" "$@"
      link_remote "$target"
      deploy_functions "$target"
      ;;
    seed)
      [[ "$target" == "staging" ]] || die "seed is staging-only"
      need_confirmation "$target" "$@"
      seed_staging
      ;;
    help | -h | --help | '') usage ;;
    *) die "unknown $target operation: $operation" ;;
  esac
}

main() {
  local target="${1:-}"
  shift || true

  case "$target" in
    local) run_local "$@" ;;
    migration) run_migration "$@" ;;
    staging | prod) run_remote "$target" "$@" ;;
    help | -h | --help | '') usage ;;
    *) die "unknown target: $target" ;;
  esac
}

main "$@"
