---
name: issues
description: Work through one or more Portfelik GitHub issues with clarifying questions before implementation. Use when explicitly invoked with /issues and issue URLs or numbers.
disable-model-invocation: true
---

# Work GitHub Issues

Work through the issues passed as arguments. Arguments may be full URLs
(`https://github.com/adrianghub/portfelik/issues/54`) or bare numbers (`54 56 55`).

Issues requested:

$ARGUMENTS

## Step 1 - Fetch

For each issue, fetch its current state with the `gh` CLI. Default repo is
`adrianghub/portfelik` when only a number is given:

```bash
gh issue view <number> --repo adrianghub/portfelik \
  --json number,title,state,labels,body,comments,assignees,milestone
```

Skip any issue already `CLOSED` and de-duplicate repeated numbers.

## Step 2 - Understand & Question

Before writing code:

- Summarize each issue in one or two lines.
- Identify dependencies or ordering and propose a sequence.
- Ask clarifying questions for ambiguity: acceptance criteria, scope, affected areas, edge cases, and data or migration impact.
- Use Socratic questions where they sharpen design assumptions and trade-offs.

Do not implement until ambiguities are resolved. If unambiguous and low-risk, say so and proceed.

## Step 3 - Plan & Execute

- Honor `CLAUDE.md` / `AGENTS.md` workflow rules and branch-sync discipline.
- Split work by concern; one logical change per commit.
- For multi-step feature work, invoke the brainstorming skill first when available.

## Step 4 - Close The Loop

For each completed issue, produce the mandatory Conventional Commit list with:

- Commit messages.
- Exact file list per commit.
- The issue each commit closes, for example `Closes #54`.

The user commits manually.
