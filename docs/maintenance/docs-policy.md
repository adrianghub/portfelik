# Documentation Policy

Docs should be current, decision-useful, and easy for a new agent or engineer to
trust.

## Rules

- Keep only canonical docs and active runbooks.
- Delete implementation plans after they ship or become superseded.
- Do not let historical plans compete with current architecture/product docs.
- Prefer one current source of truth over many partially stale records.
- Keep ADRs when they explain why an architectural decision was made. Add a
  status note if the implementation evolved.
- If a doc describes a future direction, label it clearly as planned.
- If a doc describes current behavior, verify it against source before editing.

## Canonical Locations

| Topic | Location |
| --- | --- |
| Product direction | `docs/product/product-direction.md` |
| Interaction doctrine | `docs/product/intent-oriented-ui.md` |
| Current architecture | `docs/architecture/overview.md` |
| Database and RLS | `docs/architecture/database.md` |
| Environment workflow | `docs/architecture/env-workflow.md` |
| Operational procedures | `docs/runbooks/` |
| Agent operating rules | `CLAUDE.md` and `AGENTS.md` |

## Cleanup Checklist

Run before finishing a docs reset:

```bash
git diff --check
rg -n "<deleted-doc-name>|<removed-flow-name>|<known-stale-symbol>" README.md docs AGENTS.md CLAUDE.md apps/web-svelte/CLAUDE.md supabase/CLAUDE.md .agents .claude .cursor
rg -n "<old-user-facing-term>|<old-route>" README.md docs AGENTS.md CLAUDE.md apps/web-svelte/CLAUDE.md supabase/CLAUDE.md .agents .claude .cursor
```

Remaining matches must be intentional internal schema references, ADR history, or
test/file names that still exist.
