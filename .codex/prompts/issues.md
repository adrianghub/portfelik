# Work GitHub Issues

Work through the issues passed as arguments. Arguments may be full URLs
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

Skip any issue already `CLOSED` (note it, move on). De-duplicate repeated numbers.

## Step 2 - Understand & question

Before writing code:

- Summarize each issue in one or two lines (the actual ask).
- Identify dependencies/ordering and propose a sequence.
- **Ask clarifying questions** for ambiguity: acceptance criteria, scope,
  affected areas, edge cases, data/migration impact.
- Use the **Socratic method** where it sharpens design - surface assumptions
  and trade-offs as questions so the user steers intent first.

Do not implement until ambiguities are resolved. If unambiguous and low-risk,
say so and proceed.

## Step 3 - Plan & execute

- Honor the workflow rules in `CLAUDE.md` / `AGENTS.md` (checks, lint, format,
  security, schema/RLS, commit list) and branch-sync discipline.
- Split work by concern; one logical change per commit.

## Step 4 - Close the loop

For each completed issue produce the Conventional Commit list (messages + exact
file list per commit) and note which issue each commit closes (`Closes #54`).
The user commits manually.
