# Intent-Oriented UI

Portfelik should not ask users to operate data structures. It should help them
express, confirm, and correct financial intent while deterministic engines do
the repeatable work under the hood.

A feature is not complete because the user can create, read, update, and delete
the underlying records. It is complete when the user can reach the outcome with
minimal judgment work, with clear control over exceptions.

## Core Model

**Domain engine**

The engine owns deterministic, testable behavior: matching, eligibility,
conflicts, permissions, rollback, and auditability. It should be boring,
predictable, and explainable.

**Intent memory**

The product remembers useful decisions when they repeat: a merchant usually maps
to a category, a transfer belongs to a group, a recurring payment should be
handled the same way next month.

**Decision surface**

The UI asks for decisions only where judgment matters: confirm, correct, undo,
promote a repeated pattern, or resolve a conflict. It should not expose raw
mechanics as the default workflow.

**Explanation layer**

The product explains itself at moments of trust: why a category was suggested,
why a row was skipped, why a rule did not apply, or what will change after
confirmation.

**AI assist layer**

AI may draft, cluster, summarize, name, or explain. It must not be the unchecked
source of financial state changes. AI proposes; deterministic engines dispose;
users decide exceptions.

## Canonical Example: Bank Import

The weak CRUD answer is: "Here is a categorization-rules table. Configure
conditions manually."

The Intent-Oriented UI answer is: "This merchant repeats. Want Portfelik to
remember it?" Once saved, Portfelik applies the pattern only where safe, does
not overwrite manual choices, explains the match when needed, and offers Undo.

Future AI can improve the flow by clustering unknown rows or drafting labels,
but the deterministic matcher still decides what can be applied and the user
confirms meaningful changes.

## Design Rules

- Start from the user's desired outcome, not the table being edited.
- Automate repeated decisions when the pattern is stable and reversible.
- Ask for fewer, higher-value decisions.
- Explain only when explanation helps trust, correction, or approval.
- Hide machinery by default, but keep advanced controls reachable.
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
