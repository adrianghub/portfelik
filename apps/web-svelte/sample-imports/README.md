# Sample bank import files

Synthetic, fully anonymized bank statement exports for **manually exercising the
bank-import flow** on local/staging. No real account numbers, names, or
balances — every value is made up. Safe to commit.

## How to use

1. `pnpm dev` (local) or open staging.
2. Go to **Transakcje → Import** (or the Pulpit import-health card).
3. Upload one of the CSVs below. The adapter is auto-detected; confirm and
   commit the import.

| File             | Adapter detected | Notes                                            |
| ---------------- | ---------------- | ------------------------------------------------ |
| `mbank-2026.csv` | mBank            | 2026 "Lista operacji" shape: `#Rachunek`/`#Kategoria` columns, `PLN`-suffixed amounts (`-142,30 PLN`), space thousands separators. This is the format the older parser silently rejected. |
| `ing.csv`        | ING              | Semicolon-delimited, `Nr transakcji` external ids, signed amounts. |
| `erste.csv`      | Erste            | Comma-delimited, no header row, leading summary row, quoted comma-decimal amounts. |

## Edge cases embedded (so review/fold paths get exercised)

- **Duplicate pair** — the two identical `LIDL` / `-98,76` rows (same date,
  amount, description) in each file should fold during import.
- **Mixed income/expense** — salary, tax refund, and ticket refund are positive
  (income); the rest are expenses.
- **Large amount** — the mortgage installment (`-2 100,00`) and salary
  (`9 800,00`) exercise wider number formatting.
- **Cadence span** — rows span ~1–27 June, i.e. more than the default 14-day
  import-reminder cadence, so the review cadence nudge banner appears.
- **Uncategorized rows** — all imported rows arrive without an app category, so
  they flow through the visible `Inne` confirmation path.

These files are validated by `tests/import/samples.spec.ts` (detect + parse with
zero errors), so they stay in sync as adapters evolve.
