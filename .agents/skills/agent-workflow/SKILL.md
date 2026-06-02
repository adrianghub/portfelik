---
name: agent-workflow
description: Coordinate Portfelik work across Codex, Cursor, and Claude using skills, subagents, MCP, hooks, Edgar, RTK, and project gates. Use for complex implementation, review, or workflow optimization tasks.
---
# Agent Workflow

Use this skill when the task is broad, ambiguous, high-risk, or likely to need multiple verification paths.

## Operating Model

1. Read `CLAUDE.md` and `AGENTS.md` first. Treat `CLAUDE.md` as the canonical project contract.
2. Choose skills for repeatable workflows and subagents for isolated context. Do not recreate deprecated command or prompt files.
3. Keep the parent agent responsible for decisions, edits, final synthesis, and user-facing status.
4. Delegate only bounded work with clear inputs and outputs.

## Delegation Pattern

- `codebase-explorer`: read-only mapping of relevant files, flows, and ownership. Ask for file references and unresolved questions.
- `quality-reviewer`: read-only review after changes. Ask for correctness, security, regression, and missing-test findings.
- `frontend-verifier`: UI reproduction and evidence for SvelteKit browser flows. Ask for viewport, interaction, console, and screenshot observations.
- `database-rls-reviewer`: Supabase migration, RLS, RPC, trigger, and environment-risk review.

Use parallel delegation when the workstreams are independent. Chain delegation when one result should inform the next step.

## Context Discipline

- Use `edgar --paths <file...> --question "<specific question>"` for broad or large-file reading.
- Use `edgar-parse` for noisy test, lint, compiler, or CI logs.
- Use `edgar-diff` for broad diffs before final review.
- Use `rtk gain`, `rtk gain --history`, or concise shell output when the signal would otherwise be buried.
- Verify important delegated claims directly against source, tests, or tool output before editing.

## Verification

Run the smallest relevant check first, then the required gates from `CLAUDE.md` before PR creation. For UI changes, verify actual rendered behavior. For database changes, verify migrations are idempotent, RLS remains enabled, and production/staging scopes are explicit.
