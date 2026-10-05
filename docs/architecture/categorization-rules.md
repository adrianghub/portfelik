# Explicit text conditions for categorization rules

## Decision

New rules use `match_operator = all`: every enabled text field must match its
own transaction field. Adding a counterparty condition narrows the match.
Existing rules retain `any` (OR); a missing operator in old client fixtures or
cached data also means `any`. Type, day and category-type guards still apply
independently of the text operator. Client edits preserve the operator and kind.

Rule capture starts with the entire cleaned description. Counterparty remains
an optional, separate value from the bank's counterparty field. Without a
reliable bank-specific merchant hint, retain the complete text instead of
extracting the first token. Repeated category suggestions require one consistent
category for the same normalized description. One-off category changes and
applying a category to similar rows do not persist a rule.

Normalization keeps raw provenance separate from display and matching text.
Display cleanup applies NFC and collapses whitespace without removing numbers,
locations, dates or identifiers. Matching additionally ignores case. Hashes
continue to use the original source row. The rule form previews matches with
the same matcher as import, shows examples, and blocks creation at zero matches.

## Compatibility and rollout

Apply `20261004000000_categorization_rule_text_operator.sql` before deploying
the new client. Its initial column default backfills existing rows with `any`,
then changes the default to `all` for subsequent inserts. The duplicate index
includes the operator when both text fields are present. The existing column
UPDATE grants deliberately exclude the operator.

Do not automatically collapse legacy rules with identical description and
counterparty values. There is no creation-origin marker that proves they were
generated. Removing a condition would stop their counterparty-only matches.
A future explicit conversion can show its changed matches before confirmation.

## Import review on phones

Category choices open a bottom sheet with search, the bank suggestion, recent
choices from the current import and explicit category creation. Choosing a
category changes one row. Applying it to similar rows and remembering a rule
remain separate actions, with undo for bulk category changes.

Similarity uses the complete normalized description and counterparty, transaction
type and currency. Until adapters expose a reliable merchant hint, this deliberately
keeps purchases with different descriptions separate. It does not use the rule
matcher: a rule's substring match can be wider than an import group. Skipped rows
and conflicting category overrides are excluded from the bulk action. Mobile cards
group identical review decisions and categories, show count and total, and can
expand every underlying row. Conflicting decisions remain visible separately.

Advanced filters and sorting live in a mobile sheet; the desktop retains its table.
The final confirmation counts categories that agree with the import suggestion,
manual choices, successfully created rules in this review and duplicates. The rule
count decreases when a new rule is undone; it is local to this review, not a durable
session statistic. Unclassified rows may be imported into Inne.

This change does not infer merchant names from arbitrary bank text, change
existing rule kinds, or enable production writes.

## Bank text contracts and local inspection

All five implemented bank adapters use the shared display cleanup, including
Unicode NFC. mBank combines operation description and title; ING combines title
and details. Each nonempty column is cleaned before joining, so whitespace-only
columns do not introduce separators. PKO does not substitute its counterparty
column for a missing description. Counterparty always comes from a separate bank
column, and store numbers, dates, locations and identifiers remain intact.

Parsed rows retain `text_fields` with the original primary description, optional
secondary description and counterparty columns. These fields remain in memory;
the preview insert payload does not persist them. The exact `source_row_text`
continues to determine the duplicate hash. No merchant shortening or new matching
heuristic follows from this metadata.

From `apps/web-svelte`, inspect a local export with:

```bash
pnpm import:inspect /path/to/export.csv --bank=mbank --limit=20
```

Omit `--bank` to use detection. Unrecognized layouts require an explicit bank.
The JSON report shows the original row and columns, parsed fields, display and
comparison text, independent description/counterparty rule suggestions, and parse
errors. The limit controls displayed rows (1–1000, default 20); the complete file
is parsed. This development command loads the existing parser through Vite without
the application config, environment files, code generation or a listening HTTP
server. It does not contact Supabase or telemetry. Treat the report as private
financial data; anonymize it before sharing or committing it.

Contract tests use synthetic examples with distinct bank columns, combining
Unicode, NBSP, dates and identifiers. They do not certify the adapters against
real exports; certification still follows `docs/product/bank-import-compatibility.md`.
