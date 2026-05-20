# Bank CSV Import — Design Spec (V1)

**Date:** 2026-05-20
**Status:** Approved, in implementation
**Plan:** `~/.claude/plans/i-ve-noticed-write-in-wiggly-fountain.md`

## Goal

Replace the single-button Portfelik-CSV roundtrip on `/transactions` with a real bank statement import pipeline. V1 ships adapters for **mBank** and **ING Bank Śląski**, deterministic rule-based categorization, owner-only import provenance, and a preview-first wizard.

## Non-goals (V1)

- LLM categorization (deferred — rules only)
- Multiple accounts per bank (V1 enforces one bank_accounts row per (user, kind))
- Group-shared bank accounts (per-row group_id assignment in review step instead)
- Banks other than mBank and ING (adapter shape ready, additional banks land in follow-ups)
- Image/PDF statement parsing (CSV only)
- Bank CSV round-trip back to Portfelik export

## Architecture overview

Four layers, each with its own commit set + sanity gate.

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. Parsers + adapters  (pure TS, no Supabase, no async in parse())   │
│    csv/parse.ts + csv/decode.ts + banks/{types,mbank,ing,detect}.ts  │
│    Sync parse → ParsedBankFile. Async normalize() adds SHA-256.      │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. Schema  (single migration 20260520000000_bank_import.sql)         │
│    bank_accounts (owner-only, soft-archive, unique(user,kind) active)│
│    transaction_import_sessions (owner-only, dedup-by-file-hash)      │
│    transaction_import_rows (owner-only, decisions + overrides)       │
│    transaction_import_links (owner-only, write via RPC only)         │
│    categorization_rules (owner-only, 4 kinds)                        │
│    *** ZERO new columns on transactions — privacy spine ***          │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3. Commit RPC  (commit_import_session, SECURITY DEFINER)             │
│    Race-safe (nested begin/exception on unique_violation).           │
│    Blocks on rows_pending.                                           │
│    Validates ownership, account kind, category type, group member.   │
│    FOR UPDATE lock on session.                                       │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 4. Preview-first UI  (/transactions/import wizard)                   │
│    upload → detect → account → preview → review → commit → summary   │
│    Save-as-rule on review step. Probable-dup warnings.               │
└──────────────────────────────────────────────────────────────────────┘
```

## Parser contract

`parse()` is fully synchronous and hash-free. Hashes (per-row `raw_row_hash`, overall `sourceFileHash`) are produced by `normalize()` after `parse()` returns. This keeps `parse()` testable as a pure function and avoids blocking the UI on async-in-parser.

```ts
// types.ts
export interface ParsedRow {
  posted_at: string;             // ISO yyyy-mm-dd
  amount: number;                // positive magnitude
  type: "income" | "expense";
  description: string;
  counterparty?: string;
  external_id?: string;
  currency: string;              // uppercase 3-letter
  source_row_text: string;       // exact original CSV line
  row_index: number;
}

export interface ParseError { row_index: number; reason: string; }

export interface ParsedBankFile {
  kind: "mbank" | "ing";
  rows: ParsedRow[];
  errors: ParseError[];
}

export interface BankAdapter {
  kind: "mbank" | "ing";
  detect(headers: string[]): boolean;
  parse(text: string): ParsedBankFile;
}

// normalize.ts
export interface NormalizedRow extends ParsedRow {
  raw_row_hash: string;
}
export function normalize(
  parsed: ParsedBankFile,
  fileBytes: ArrayBuffer
): Promise<{ rows: NormalizedRow[]; errors: ParseError[]; sourceFileHash: string }>;
```

### Bank-specific conventions

| Bank | Encoding | Separator | Sign convention | External id field |
|---|---|---|---|---|
| mBank | Windows-1250 | `;` | Signed `Kwota` column (negative = expense) | `#Operacja` |
| ING | UTF-8 (sometimes Windows-1250) | `;` | Separate `Kwota debetu` / `Kwota kredytu` columns | reference in description column (TBD per fixture) |

**Fixture sourcing is a step-2 prerequisite.** Until real anonymized exports from each bank are committed and verified, the adapter is provisional. Anonymization rules (committed alongside fixtures):
- Replace account numbers with `PL00 0000 0000 0000 0000 0000 0000`
- Replace personal names with `Jan Kowalski` / `Anna Nowak`
- Keep merchant names (Biedronka, Żabka, etc.) — needed for rule-engine testing
- Replace operation IDs with sequential `EXT-001`, `EXT-002`, …

## Privacy spine

- Bank provenance (account, external id, fingerprint, raw-row hash, session id) lives in **owner-only** `transaction_import_links`.
- The shared `transactions` row has zero bank metadata. Group members never see bank data through `transactions_with_category`.
- `transaction_import_links` is **RPC-write-only** — INSERT/UPDATE/DELETE not granted to `authenticated`. Only the SECURITY DEFINER commit RPC writes. SELECT is granted so the UI can scan fingerprints for probable-dup warnings.
- Raw CSV bytes never persist server-side. Sanitized normalized fields + `raw_row_hash` are the storage record. The raw line itself stays in browser memory until either committed (via the sanitized fields) or discarded.

## Dedupe strategy

Two levels.

### Strong (hard) dedupe — DB-enforced via unique indexes on `transaction_import_links`:

1. **`external_transaction_id` match** — when the bank provides an operation id, that id can only appear once per (user, bank_account).
2. **Same-file row idempotency** — `(user_id, bank_account_id, source_file_hash, source_row_index)` — re-uploading the same file cannot re-insert the same row.

### Probable (soft) dedupe — UI-surfaced warning, NOT DB-enforced:

- `fingerprint = sha256(amount | posted_at | normalize(description))` is stored on every link.
- New rows whose fingerprint matches an existing link get flagged in the review UI.
- User explicit decision: **Import anyway** (proceeds to commit) or **Mark as duplicate** (skip).
- Fingerprint must NOT back a unique index — two legit transactions can share fingerprint values (e.g. two coffees same day at same shop).

### Race safety

Even after the external-id pre-check, two concurrent commits could insert links with the same external id. The commit RPC wraps each row's INSERT in a nested `begin … exception when unique_violation … end` block. On violation, the row is marked `duplicate` (with `duplicate_of` linked to the winning transaction) and the loop continues — the whole session does not fail.

## Categorization rules

Four kinds, evaluated in priority order:

| Kind | Match condition | Default priority |
|---|---|---|
| `exact` | `lower(description) = lower(value)` OR `lower(counterparty) = lower(value)` | **400** |
| `composite` | All non-null match fields above must hit (e.g. description contains X AND type=expense) | **350** |
| `contains` | `lower(description \|\| counterparty) LIKE %lower(value)%` | **300** |
| `type` | `row.type = value` only | **100** |

Composite outranks plain `contains` because adding the `type` dimension increases specificity.

Rule storage in `categorization_rules`. RLS owner-only. The review step exposes a **"Zapisz jako regułę"** button that creates the most-specific rule that would have matched the user's manual category assignment.

## Soft-archive policy

No client-side DELETE on bank-import tables. `bank_accounts.archived_at` replaces hard delete so dedupe and audit chains survive. FKs from sessions → accounts and rows → sessions and links → {accounts, sessions, rows} are all `ON DELETE RESTRICT`. Only when a transaction itself is deleted does its link cascade.

## Cancelled session re-upload

`transaction_import_sessions` unique index is partial: `unique(user_id, bank_account_id, source_file_hash) WHERE status <> 'cancelled'`. Cancelled sessions don't block re-uploading the same file. Active or committed sessions of the same file resume the existing session instead of creating a new one.

## Verification gates

Each step ends with svelte-check / lint / format clean + targeted test suite green:

1. **Spec doc** (this file) — review pass.
2. **Parsers** — `pnpm test:rls` (after vitest include extension to `tests/import/**`). All parser cases on real anonymized fixtures.
3. **Schema + RLS** — 52 existing RLS tests + ~25 new = ~77 pass locally. Migration applies to prod via MCP cleanly.
4. **Service + commit RPC** — RPC contract specs (rows_pending guard, race-safe dup handling, kind-mismatch reject).
5. **Wizard UI** — manual walkthrough on local stack with seeded fixtures.
6. **e2e + docs** — mocked Playwright through full flow, including dedupe override + save-as-rule. Docs sweep across `CLAUDE.md`, `AGENTS.md`, `docs/architecture/database.md`.

## Out of scope, logged

See plan file's "Out of scope" section. Mortgage/debt tracking is the most likely follow-on consumer (`external_transaction_id` + `bank_account_id` make matching bank-reported debt payments straightforward).
