---
description: Work through one or more GitHub issues with clarifying questions and Socratic discussion before implementing.
argument-hint: <issue-url-or-number> [more urls/numbers...]
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, AskUserQuestion, Skill, Task
---

# Work GitHub Issues

You will work through the issues listed below. Arguments may be full URLs
(`https://github.com/adrianghub/portfelik/issues/54`) or bare numbers (`54 56 55`).

Issues requested:

$ARGUMENTS

## Step 1 - Fetch

For each issue, fetch its current state with the `gh` CLI. Default repo is
`adrianghub/portfelik` when only a number is given:

```
gh issue view <number> --repo adrianghub/portfelik \
  --json number,title,state,labels,body,comments,assignees,milestone
```

Skip any issue already `CLOSED` (note it and move on). De-duplicate repeated
numbers in the argument list.

## Step 2 - Understand & question

Before writing any code:

- Summarize each issue in one or two lines (the actual ask, not the title).
- Identify dependencies/ordering between issues and propose a sequence.
- **Ask clarifying questions** for anything ambiguous: acceptance criteria,
  scope boundaries, affected areas, edge cases, data/migration impact.
- Use the **Socratic method** where it sharpens the design - surface
  assumptions and trade-offs as questions rather than declaring decisions,
  so the user steers intent before implementation.

Do not start implementing until ambiguities are resolved. If an issue is
unambiguous and low-risk, say so and proceed.

## Step 3 - Plan & execute

- Honor the workflow rules in `CLAUDE.md` (sanity check, lint, format,
  security grep, schema/RLS, Paraglide recompile, commit list) and the
  branch-sync discipline.
- Split work by concern; one logical change per commit.
- For multi-step feature work, invoke the brainstorming skill first.

## Step 4 - Close the loop

For each issue completed, produce the mandatory Conventional Commit list
(messages + exact file list per commit) and note which issue each commit
closes (e.g. `Closes #54`). The user commits manually.
