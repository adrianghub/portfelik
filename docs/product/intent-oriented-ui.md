# Intent-Oriented UI

Portfelik should help users express, confirm, and correct financial intent while
deterministic engines handle repeatable mechanics. This doctrine complements the
current [product direction](./product-direction.md).

A feature is not complete because the user can create, read, update, and delete
the underlying records. It is complete when the user can reach the outcome with
minimal judgment work, clear control over exceptions, and an explanation when
trust matters.

## Core Model

**Domain engine**

The engine owns deterministic, testable behavior: parsing, matching,
eligibility, conflicts, permissions, rollback, and auditability. It should be
predictable and explainable.

**Intent memory**

The product remembers useful repeat decisions: a merchant maps to a category, a
transfer belongs to a group, or a future plan should be settled against matching
transactions.

**Decision surface**

The UI asks for decisions only where judgment matters: confirm, correct, undo,
promote a repeated pattern, or resolve a conflict. It should not expose raw
database mechanics as the default workflow.

**Explanation layer**

The product explains itself at moments of trust: why a category was suggested,
why a row was skipped, why a rule did not apply, why a transaction matches a
plan, or what will change after confirmation.

**AI assist layer**

AI may draft, cluster, summarize, name, or explain. It must not be the unchecked
source of financial state changes. AI proposes; deterministic engines dispose;
users decide exceptions.

## Canonical Example: Bank Import

The weak CRUD answer is: "Here is a categorization-rules table. Configure
conditions manually."

The Portfelik answer is: "This statement is safe to import. These few rows need
attention." Clean rows import by default, duplicates are folded, uncategorized
rows are transparently routed through `Inne`, and only genuinely risky rows
become pending.

Future AI can cluster unknown rows or explain why a rule matched, but the parser,
categorization rules, duplicate scan, and commit RPC remain deterministic.

## Canonical Example: Plan Settlement

The weak CRUD answer is: "Complete a list and create a transaction."

The Portfelik answer is: "You planned a trip. These existing bank transactions
settle that plan." A plan expresses intent; imported/manual transactions record
reality; settlement links them and shows progress.

Future deterministic matching should produce a score and reasons, such as:

- date is inside the plan range
- category matches the plan
- merchant/description contains a plan keyword
- amount matches the plan or one of its items
- transaction is not already linked to another plan
- the user did not previously reject this match

AI may later explain or summarize the result. It should not decide settlement
without deterministic eligibility and user control.

## Design Rules

- Start from the user's desired outcome, not the table being edited.
- Automate repeated decisions when the pattern is stable and reversible.
- Ask for fewer, higher-value decisions.
- Explain only when explanation helps trust, correction, or approval.
- Hide machinery by default, but keep advanced controls reachable.
- Keep manual entry available as fallback, not the main product path.
- Never let probabilistic output directly mutate financial truth.

## Review Questions

Use these questions before calling a workflow done:

- What intent is the user trying to express or confirm?
- Which mechanical decisions can the system handle deterministically?
- Where can the system safely learn from repeated user choices?
- What is the smallest useful decision surface?
- What can the user undo or correct?
- What should be explained, and at which moment?
- If AI is involved, which deterministic guard validates its output?
