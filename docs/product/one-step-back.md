# One step back, two steps forward

How JakStoimy grows. This doctrine sits next to
[Intent-oriented UI](./intent-oriented-ui.md).

A household budget may give money a job. The job is a limit on a category:
a name, an amount, and a period. Paid expenses from the bank fill the bar.
The user sets the amount. The ledger does the counting.

That job does not need a second ledger. Manual assets, a net-worth total, a
surplus after savings pace, and an engine that assigns every zloty were a
separate product. They made Plany and Kokpit answer a question the Saturday
review does not ask.

## The move

1. Remove one whole vertical that the current product no longer shows.
2. Add the smaller behavior that replaces it.
3. Leave database tables in place until nothing reads them. Export may still
   include old rows. A later migration drops the tables.

Do not delete import, categories, groups, upcoming payments, saving goals, or
loans to make room. Those stay.

## What left the interface

- Net worth on Kokpit and on Plany
- The surplus card and its action queue
- Foreign-currency conversion used only for that total
- The unused money-assignment engine

## What replaced it

- A category spending limit for the current month or the current year
- A short line after import: income, expenses, and the largest category

The next addition has to name which of these it replaces. If it replaces
nothing, it does not land yet.
