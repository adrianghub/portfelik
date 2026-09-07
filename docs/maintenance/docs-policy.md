# Documentation Policy

Docs should be current, decision-useful, and easy to trust. **Code, migrations,
and PRs are the source of truth** for what the product does today.

## Rules

- Keep only canonical product/architecture docs and active runbooks.
- Delete implementation plans and one-off design dumps after they ship.
- Do not let historical plans compete with current architecture/product docs.
- Prefer one current source of truth over many partially stale records.
- Keep ADRs when they explain *why* a technical decision was made.
- If a doc describes future direction, put it in a GitHub issue — not a
  second product bible.
- If a doc describes current behavior, verify it against source before editing.

## Canonical locations

| Topic | Location |
| --- | --- |
| Product direction | `docs/product/product-direction.md` |
| Polish product voice | `docs/product/polish-voice.md` |
| Interaction doctrine | `docs/product/intent-oriented-ui.md` |
| Architecture | `docs/architecture/overview.md` |
| Database and RLS | `docs/architecture/database.md` |
| Environment workflow | `docs/architecture/env-workflow.md` |
| Operational procedures | `docs/runbooks/` |
| Agent operating rules | `CLAUDE.md` and `AGENTS.md` |

## Cleanup checklist

```bash
git diff --check
rg -n "<deleted-doc-name>" README.md docs AGENTS.md CLAUDE.md apps/web-svelte supabase .agents .claude .cursor
```

Remaining matches must be intentional internal schema references, ADR history,
or test/file names that still exist.
