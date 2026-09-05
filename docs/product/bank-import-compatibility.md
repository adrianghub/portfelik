# Bank import compatibility

This matrix separates parser coverage from validation against real bank exports.
Synthetic fixtures prove the adapter contract, but they do not certify that a
bank's current export format is supported.

| Adapter           | Automatic detection                                                                    | Contract tests                               | Real-export certification |
| ----------------- | -------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------- |
| mBank             | Structurally high for the `#Opis operacji` layout; user confirmation is required       | Synthetic fixture and 2026 layout case       | Not recorded              |
| ING Bank Śląski   | Structurally high with the ING brand and distinctive headers; confirmation is required | Synthetic transaction and card-hold fixtures | Not recorded              |
| Erste Bank Polska | Medium; confirmation is required for the headerless layout                             | Committed headerless fixture                 | Not recorded              |
| PKO BP            | Medium only when a PKO/iPKO brand signal accompanies compatible headers                | Provisional synthetic contract fixture       | Not certified             |
| Millennium        | Medium only when a Millennium brand signal accompanies compatible headers              | Provisional synthetic contract fixture       | Not certified             |

Generic `Data transakcji` / `Kwota` headers must not select a bank. When the
brand or layout is ambiguous, the import flow requires the user to choose the
adapter before parsing.

Structural detection confidence and real-export certification are separate.
Only adapters that pass the checklist below may bypass explicit bank
confirmation. At present no registered adapter is allowed to auto-proceed.

## Certification checklist

An adapter can be marked as validated against real exports only after all of
the following evidence is committed or referenced in a release issue:

1. At least two anonymized exports covering the currently offered web export
   variants, with their bank/export version and acquisition date recorded.
2. UTF-8 and Windows-1250 decoding checked when the bank offers both.
3. Expected row count, booking dates, signed debit/credit amounts, currency,
   counterparty, and stable transaction identifiers asserted.
4. Preamble, footer, quoted separators, zero-value rows, and malformed rows
   exercised where present in the real format.
5. Duplicate import and partial-parse behavior verified through the import UI.

Fixtures must contain no names, account numbers, addresses, identifiers, or
balances copied from a real customer. Replace every sensitive value while
preserving delimiters, quoting, column order, encoding, and row structure.
