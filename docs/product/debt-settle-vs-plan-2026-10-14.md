# Debt settle vs plan — control follow-up

**Status:** approved 2026-10-14  
**Branch:** `cursor/debt-plan-settle-split-e8ce`  
**Scope:** Post-#369 control PR. No new “plan unpaid rata” ledger path.

## Decision

Future installments are planned as a **recurring transaction** (or other Transakcje flows). Debt plan surfaces only **settle** paid installments (`create_and_link` / link with `paid`). Backend `debt_link_requires_paid` stays.

## Changes

1. Debt settle / detail manual CTA copy names paid booking, not generic “add”.
2. Dialog for debt create-and-link: title + note that this books a paid rata; hide status and recurring (planning lives in Transakcje).
3. Short hint on debt detail: future raty → cykliczna; spłata → powiąż po zapłacie.
4. Analysis forecast bar hint: drill-down includes projected recurring rows.

## Out of scope

- Separate “Zaplanuj ratę” CTA creating unlinked `upcoming` rows.
- Confirmed spend remainders parity in bar drill-down.
