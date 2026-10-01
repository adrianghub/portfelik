#!/usr/bin/env bash
# scripts/open-pr.sh [base] [--dry-run] [--draft] [--no-auto-merge]
# Runs gates; blocks on failure; otherwise builds the PR body from git history
# and creates/updates the PR via gh. Portable across Claude Code / Codex / Cursor / shell.
#
# Feature → dev (default): mark ready (unless --draft) and enable merge-commit
# auto-merge (unless --no-auto-merge). Production promotions (dev → main) never
# auto-merge here — use ./scripts/promote.sh --merge.
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT"
SCRIPT_DIR="$ROOT/scripts"

DRY=0
DRAFT=0
NO_AUTO_MERGE=0
BASE_ARG=""
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --draft) DRAFT=1 ;;
    --no-auto-merge) NO_AUTO_MERGE=1 ;;
    -h | --help)
      echo "usage: ./scripts/open-pr.sh [base] [--dry-run] [--draft] [--no-auto-merge]"
      exit 0
      ;;
    *)
      if [ -n "$BASE_ARG" ]; then
        echo "usage: ./scripts/open-pr.sh [base] [--dry-run] [--draft] [--no-auto-merge]" >&2
        exit 2
      fi
      BASE_ARG="$a"
      ;;
  esac
done

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = main ] && { echo "Refuse: currently on main." >&2; exit 1; }

# Base per CLAUDE.md branch flow: dev -> main, anything else -> dev. Arg overrides.
if [ -n "$BASE_ARG" ]; then BASE="$BASE_ARG"
elif [ "$BRANCH" = dev ]; then BASE=main
else BASE=dev; fi

if ! bash "$SCRIPT_DIR/check-branch-flow.sh" "$BASE" "$BRANCH"; then
  echo "PR blocked - unsupported branch direction." >&2
  exit 1
fi

# Dirty tree blocks a real PR (body is built from commits); a dry-run still previews.
if [ $DRY -eq 0 ] && [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty - commit before opening a PR (the body is built from commits)." >&2
  exit 1
fi

if ! git fetch -q origin "$BASE"; then
  echo "PR blocked - could not refresh origin/$BASE." >&2
  exit 1
fi

GATES_OUT="$(bash "$SCRIPT_DIR/pr-gates.sh" "origin/$BASE")"; GATES_RC=$?
if [ $GATES_RC -ne 0 ]; then
  echo "PR blocked - failing gates:" >&2
  printf '%s\n' "$GATES_OUT" | awk -F'|' '$1=="GATE" && $3=="FAIL"{printf "  x %s - %s\n",$2,$4}' >&2
  exit 1
fi

flagval() { printf '%s\n' "$GATES_OUT" | awk -F'|' -v k="$1" '$1=="FLAG"&&$2==k{print $3}'; }
gateval() { printf '%s\n' "$GATES_OUT" | awk -F'|' -v k="$1" '$1=="GATE"&&$2==k{print $3}'; }
ck() { [ "$1" = PASS ] && echo "[x]" || echo "[ ]"; }

SUMMARY="$(git log --format='- %s' "origin/$BASE..HEAD")"
WHY="$(git log --format='%b' "origin/$BASE..HEAD" | awk 'NF' | sed 's/^/- /')"
[ -z "$WHY" ] && WHY="- See commits above."
TITLE="$(git log -1 --format='%s' HEAD)"

if [ "$(flagval migrations_changed)" = true ]; then
  MIG="- [x] New migration names are idempotent and not amended after apply
- [x] RLS is enabled on new tables
- [x] Applied migrations were not modified"
else
  MIG="- [x] Not applicable"
fi

if [ "$(flagval pl_json_changed)" = true ]; then
  PARA="- [x] Recompiled Paraglide (\`messages/pl.json\` changed)"
else
  PARA="- [x] Not applicable"
fi

if [ "$(gateval test:rls)" = NA ]; then
  RLS_LINE="- [x] RLS suite - not applicable (no schema/policy change)"
else
  RLS_LINE="- $(ck "$(gateval test:rls)") RLS suite is green"
fi

if [ "$(gateval test:e2e)" = NA ]; then
  E2E_LINE="- [x] Mocked E2E - not applicable (no UI/copy/e2e change)"
else
  E2E_LINE="- $(ck "$(gateval test:e2e)") \`pnpm test:e2e\` (mocked Playwright) is green"
fi

COMP_LINE="- $(ck "$(gateval test:components)") \`pnpm test:components\` is green"
BODY="$(cat <<EOF
<!-- Auto-filled by scripts/open-pr.sh - do not hand-edit. -->
## Summary

$SUMMARY

## Why

$WHY

## Gates

- $(ck "$(gateval svelte-check)") \`pnpm exec svelte-check --tsconfig ./tsconfig.json\` is 0/0
- $(ck "$(gateval lint)") \`pnpm lint\` is clean
- $(ck "$(gateval format)") \`pnpm format:check\` is clean
- $(ck "$(gateval test:unit)") \`pnpm test:unit\` is green
$COMP_LINE
$E2E_LINE
$RLS_LINE
- $(ck "$(gateval secret-scan)") Secret scan is clean

## Migrations

$MIG

## Paraglide

$PARA

## Branch Sync

- [x] Branch was synced from \`origin/$BASE\` per \`CLAUDE.md\`
EOF
)"

if [ $DRY -eq 1 ]; then
  echo "base: $BASE   head: $BRANCH"
  echo "title: $TITLE"
  echo "draft: $DRAFT   auto-merge: $([ "$BASE" = dev ] && [ $NO_AUTO_MERGE -eq 0 ] && [ $DRAFT -eq 0 ] && echo yes || echo no)"
  echo "----- body -----"
  printf '%s\n' "$BODY"
  echo "----- dry run: no push, no gh -----"
  exit 0
fi

git push -q -u origin "$BRANCH"
# Only an OPEN PR counts as existing - `gh pr view` also matches MERGED/CLOSED PRs
# for the branch, which would make us edit+reprint a dead PR instead of opening one.
EXISTING_PR="$(gh pr list --head "$BRANCH" --state open --json url -q '.[0].url')"
if [ -n "$EXISTING_PR" ]; then
  gh pr edit "$BRANCH" --body "$BODY" >/dev/null
  PR_URL="$EXISTING_PR"
else
  CREATE_ARGS=(--base "$BASE" --head "$BRANCH" --title "$TITLE" --body "$BODY")
  if [ $DRAFT -eq 1 ]; then
    CREATE_ARGS=(--draft "${CREATE_ARGS[@]}")
  fi
  PR_URL="$(gh pr create "${CREATE_ARGS[@]}")"
fi

# Feature → dev: ready + merge-commit auto-merge by default.
# Production promotions stay intentional (promote.sh --merge).
if [ "$BASE" = "dev" ] && [ $DRAFT -eq 0 ]; then
  if gh pr view "$PR_URL" --json isDraft --jq '.isDraft' | grep -q true; then
    gh pr ready "$PR_URL" >/dev/null || true
  fi
  if [ $NO_AUTO_MERGE -eq 0 ]; then
    if gh pr merge "$PR_URL" --auto --merge >/dev/null; then
      echo "Auto-merge enabled (merge commit)." >&2
    else
      echo "Could not enable auto-merge (checks/branch protection). Merge as a merge commit when green." >&2
    fi
  fi
elif [ "$BASE" = "main" ]; then
  echo "Production PR: auto-merge not enabled here. Use ./scripts/promote.sh --merge when ready." >&2
fi

echo "$PR_URL"
