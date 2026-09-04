# CLAUDE.md

Canonical operating rules for agents working in this repository. This file is
not a changelog, release log, task tracker, or handoff diary. Use Git history,
pull requests, issues, and the documents under `docs/` for those purposes.

## Required workflow

Apply these rules to every task.

### Before editing

- Read the nearest scoped guidance. For `apps/web-svelte/**`, read
  `.claude/rules/svelte-gotchas.md`; for Supabase work, read
  `supabase/CLAUDE.md`.
- Keep unrelated user changes intact. Do not clean or rewrite a dirty worktree.
- On `dev`, sync from `origin/main` before starting new feature work. Feature
  branches start from current `dev`.
- Use `/Users/adrianzinko/.local/bin/edgar` for broad context, three or more
  files, files over roughly 400 lines, noisy output, and large diffs. Verify
  important findings against source.

### Verification

Run from `apps/web-svelte/` unless noted otherwise:

1. `pnpm exec svelte-check --tsconfig ./tsconfig.json`
2. `pnpm lint`
3. `pnpm format:check`
4. `pnpm test:unit`
5. `pnpm test:e2e` whenever UI, copy, routes, or E2E tests change
6. `pnpm test:rls` whenever migrations, policies, functions, or SQL change
7. Recompile Paraglide after editing `messages/pl.json`:
   `pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide`
8. Review changed files for credentials and run `git diff --check`

Do not claim PR readiness while a required gate is skipped or failing.
`./scripts/open-pr.sh` is the canonical PR entry point and runs the repository
gate suite.

### Change discipline

- Split work by concern: schema, services, components, configuration, docs.
- Never amend a migration that may already have been applied.
- New database objects require explicit grants and RLS review.
- Use repo skills under `.agents/skills/**` for repeatable workflows such as
  `/pr`, `/issues`, and deployment.
- Use subagents only for bounded exploration or independent review. The main
  agent owns final decisions, edits, verification, and user communication.
- Keep output compact. `rtk` is available at `/opt/homebrew/bin/rtk`; use
  `edgar-parse` when test or compiler output is noisy.

### Documentation policy

- Do not append implementation summaries, test counts, dated status entries,
  commit plans, or immediate-next-step notes to this file.
- Update `CLAUDE.md` only when durable agent rules, architecture entry points,
  branch policy, or product invariants change.
- Record product decisions in `docs/product/`, architecture in
  `docs/architecture/`, operational procedures in `docs/runbooks/`, and scoped
  implementation designs in `docs/specs/`.
- Track unfinished work in GitHub issues/projects, not in this file.

## Product invariants

JakStoimy is an import-first personal-finance PWA built with SvelteKit and
Supabase. Canonical direction lives in:

- `docs/product/product-direction.md`
- `docs/product/intent-oriented-ui.md`
- `docs/product/debt-and-savings-goals.md`

The product spine is Kokpit, Transakcje, Import, Plany, and Ustawienia. Main
navigation intentionally exposes Kokpit, Transakcje, and Plany; Import is a
flow entered from transaction and reminder surfaces.

- Bank import is the preferred source of transaction truth. Manual entry is a
  fallback and correction path.
- Import review is an exception surface. Clean rows should require minimal
  work; duplicates, uncategorized rows, and genuine risk remain explicit.
- A category choice is one-off by default. Applying it to similar rows and
  creating or changing a persistent rule require explicit user actions.
- Plans express future intent. Settlement should link existing transactions
  rather than manufacture financial history by default.
- Ledger values and forecast values must remain visibly distinct and use
  consistent date boundaries across modules.
- Alerts reinforce existing financial actions; they are not a generic task
  system. Push is an optional delivery channel, never the source of state.
- Private and group scopes must remain explicit. Import provenance is private;
  group writes follow owner/co-owner permissions.

## Branch and environment model

- `main` is production truth and deploys to `app.jakstoimy.pl`.
- `dev` is staging/integration and deploys to `dev.portfelik.pages.dev`.
- Feature branches start from `dev` and merge back into `dev`.
- After production promotion, sync `dev` from `origin/main` immediately.
- Production and staging use separate Supabase projects. Never reuse cloud
  credentials between them.
- Full environment and deployment details live in
  `docs/architecture/env-workflow.md` and the relevant runbooks.

## Repository map

```text
apps/web-svelte/   Active SvelteKit application
supabase/          Migrations, Edge Functions, RLS, and Supabase configuration
docs/product/      Product direction and domain rules
docs/architecture/ System architecture and environment model
docs/runbooks/     Operational procedures
docs/specs/        Scoped implementation designs
.agents/skills/    Reusable cross-agent workflows
```

More specific guidance takes precedence over this root file.
