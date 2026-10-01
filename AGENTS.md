# AGENTS.md

Canonical agent guidance lives in [@CLAUDE.md](./CLAUDE.md). Read that file -
this one is a pointer to keep tools that look only for `AGENTS.md` (e.g.
Codex, GitHub Copilot) from missing the rules.

Everything in `CLAUDE.md` applies regardless of which assistant is running:
agent workflow rules, project status, the bank-CSV-import progress sub-table,
infrastructure / deploy commands, branch flow, and Supabase MCP notes.

## Opening a Pull Request

Do **not** hand-fill `.github/pull_request_template.md`. Run:

```bash
./scripts/open-pr.sh [base] [--draft] [--no-auto-merge] [--dry-run]
```

It runs every gate (typecheck, lint, format, unit tests, component tests,
**mocked E2E when UI/copy/routes/e2e change**, secret scan, and the RLS suite
when schema/policy files changed), **blocks without opening a PR if any gate
fails**, and otherwise auto-generates the entire PR body - Summary and Why from
the branch's commit messages, every checkbox from the real gate results, and the
Migrations / Paraglide / Branch-sync sections from the diff. The base branch is
inferred per `CLAUDE.md` (`dev` → `main`, otherwise `dev`); pass an argument to
override. Feature → `dev` PRs are marked ready and get merge-commit auto-merge
unless `--draft` or `--no-auto-merge`. Add `--dry-run` to preview the body
without pushing or calling `gh`.

## Promote / ship

```bash
./scripts/promote.sh [--dry-run] [--merge] [--force]
```

See `docs/runbooks/promote-and-ship.md`. Agents: `/ship` for feature → staging;
`/ship --promote` (or `promote.sh`) for production.
