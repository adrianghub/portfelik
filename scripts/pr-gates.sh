#!/usr/bin/env bash
# scripts/pr-gates.sh <base-ref>
# Deterministic PR gate runner + change detection.
# stdout (machine-readable):  GATE|<name>|PASS|FAIL|NA|<detail>   and  FLAG|<name>|<value>
# stderr (human):             a readable verdict table
# Exit 1 if ANY gate is FAIL (callers use this to block).
set -uo pipefail

BASE="${1:?usage: pr-gates.sh <base-ref>  (e.g. origin/dev)}"
ROOT="$(git rev-parse --show-toplevel)"
WEB="$ROOT/apps/web-svelte"
cd "$ROOT"

fail=0
gate() { # <name> <status> <detail>
  printf 'GATE|%s|%s|%s\n' "$1" "$2" "$3"
  printf '  [%-4s] %-13s %s\n' "$2" "$1" "$3" >&2
  [ "$2" = FAIL ] && fail=1
  return 0
}
flag() { printf 'FLAG|%s|%s\n' "$1" "$2"; }

# Files this branch changed vs base (three-dot = since merge-base).
# Newline-delimited string (not an array) for bash 3.2 compatibility (macOS).
CHANGED="$(git diff --name-only "$BASE"...HEAD 2>/dev/null)"
changed_match() { printf '%s\n' "$CHANGED" | grep -qE "$1"; }
stack_up() { (exec 3<>/dev/tcp/127.0.0.1/54321) 2>/dev/null; }

# --- svelte-check (must be 0 errors / 0 warnings) ---
sc_out="$(cd "$WEB" && pnpm exec svelte-check --tsconfig ./tsconfig.json 2>&1)"
sc_line="$(printf '%s\n' "$sc_out" | grep -E 'COMPLETED' | tail -1)"
if printf '%s' "$sc_line" | grep -qE ' 0 ERRORS 0 WARNINGS'; then
  gate svelte-check PASS "0/0"
else
  gate svelte-check FAIL "${sc_line:-no COMPLETED line found}"
fi

# --- lint ---
if (cd "$WEB" && pnpm lint >/tmp/pr-lint.log 2>&1); then
  gate lint PASS "clean"
else
  gate lint FAIL "$(tail -1 /tmp/pr-lint.log) (see /tmp/pr-lint.log)"
fi

# --- format ---
if (cd "$WEB" && pnpm format:check >/tmp/pr-fmt.log 2>&1); then
  gate format PASS "clean"
else
  gate format FAIL "run pnpm format (see /tmp/pr-fmt.log)"
fi

# --- unit tests ---
if (cd "$WEB" && pnpm test:unit >/tmp/pr-unit.log 2>&1); then
  gate test:unit PASS "green"
else
  gate test:unit FAIL "see /tmp/pr-unit.log"
fi

# --- secret scan over changed, existing files ---
# Match secret VALUES, not variable names: JWTs, Supabase secret keys, PEM
# private-key blocks, and hardcoded quoted password literals. Sensitive tokens are
# split (PRI''VATE, sb''_secret_) so this scanner never matches its own definition.
Q="\"'"
SECRET_RE='(eyJ[A-Za-z0-9_-]{30,}|sb''_secret_[A-Za-z0-9]|-----BEGIN [A-Z ]*PRI''VATE KEY-----|password[[:space:]]*=[[:space:]]*['"$Q"'][^'"$Q"'[:space:]]+)'
: > /tmp/pr-secret.log
secret_hit=0
if [ -n "$CHANGED" ]; then
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    if grep -EnI "$SECRET_RE" "$f" >>/tmp/pr-secret.log 2>/dev/null; then secret_hit=1; fi
  done <<< "$CHANGED"
fi
if [ "$secret_hit" -eq 0 ]; then
  gate secret-scan PASS "clean"
else
  gate secret-scan FAIL "matches in: $(cut -d: -f1 /tmp/pr-secret.log | sort -u | tr '\n' ' ')"
fi

# --- RLS suite (only when schema/policy changed) ---
if changed_match '^supabase/migrations/|\.sql$'; then
  if stack_up; then
    if (cd "$WEB" && pnpm test:rls >/tmp/pr-rls.log 2>&1); then
      gate test:rls PASS "green"
    else
      gate test:rls FAIL "see /tmp/pr-rls.log"
    fi
  else
    gate test:rls FAIL "local Supabase stack down - run: supabase start"
  fi
else
  gate test:rls NA "no schema/policy changes"
fi

# --- detection flags ---
mig="$(printf '%s\n' "$CHANGED" | grep -E '^supabase/migrations/' || true)"
if [ -n "$mig" ]; then
  flag migrations_changed true
  flag migrations_files "$(printf '%s' "$mig" | tr '\n' ';')"
else
  flag migrations_changed false
fi

if changed_match '(^|/)messages/pl\.json$'; then
  flag pl_json_changed true
  (cd "$WEB" && pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide >/dev/null 2>&1)
  if [ -z "$(git status --porcelain -- apps/web-svelte/src/lib/paraglide)" ]; then
    flag paraglide_in_sync true
  else
    flag paraglide_in_sync false
    gate paraglide FAIL "recompile + commit apps/web-svelte/src/lib/paraglide"
  fi
else
  flag pl_json_changed false
fi

if git merge-base --is-ancestor "$BASE" HEAD 2>/dev/null; then
  flag branch_synced true
else
  flag branch_synced false
  gate branch-sync FAIL "merge latest $BASE into this branch"
fi

exit $fail
