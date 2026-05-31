# AGENTS.md

Canonical agent guidance lives in [@CLAUDE.md](./CLAUDE.md). Read that file —
this one is a pointer to keep tools that look only for `AGENTS.md` (e.g.
Codex, GitHub Copilot) from missing the rules.

Everything in `CLAUDE.md` applies regardless of which assistant is running:
agent workflow rules, project status, the bank-CSV-import progress sub-table,
infrastructure / deploy commands, branch flow, and Supabase MCP notes.

## Opening a Pull Request

Do **not** hand-fill `.github/pull_request_template.md`. Run:

```bash
./scripts/open-pr.sh [base]
```

It runs every gate (typecheck, lint, format, unit tests, secret scan, and the RLS
suite when schema/policy files changed), **blocks without opening a PR if any gate
fails**, and otherwise auto-generates the entire PR body — Summary and Why from the
branch's commit messages, every checkbox from the real gate results, and the
Migrations / Paraglide / Branch-sync sections from the diff. The base branch is
inferred per `CLAUDE.md` (`dev` → `main`, otherwise `dev`); pass an argument to
override. Add `--dry-run` to preview the body without pushing or calling `gh`.
