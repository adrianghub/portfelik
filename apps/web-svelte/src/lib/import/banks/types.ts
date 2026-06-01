// Pure types for the bank-CSV import pipeline.
// No Supabase, no async, no DOM. Adapters and parsers live in plain TS so
// they can be unit-tested against committed fixtures.
//
// Two-stage split (per design spec 2026-05-20):
//   1. BankAdapter.parse() is fully synchronous and hash-free.
//   2. import/normalize.ts then adds raw_row_hash + sourceFileHash via Web Crypto.

export type BankKind = "mbank" | "ing";

export type TransactionType = "income" | "expense";

export interface ParsedRow {
  /** ISO yyyy-mm-dd, posted/booked date depending on adapter choice. */
  posted_at: string;
  /** Positive magnitude - sign lives in `type`. */
  amount: number;
  type: TransactionType;
  /** Sanitized free-text description. Whitespace collapsed. */
  description: string;
  /** Counterparty name when bank provides one separately. */
  counterparty?: string;
  /** Bank's operation id when extractable (used for hard dedup). */
  external_id?: string;
  /** Uppercase 3-letter ISO 4217 (e.g. "PLN"). */
  currency: string;
  /** Exact original CSV line - fed into normalize() for hashing. */
  source_row_text: string;
  /** 0-based position in the source file (after header). */
  row_index: number;
}

export interface ParseError {
  row_index: number;
  reason: string;
}

export interface ParsedBankFile {
  kind: BankKind;
  rows: ParsedRow[];
  errors: ParseError[];
}

export interface BankAdapter {
  kind: BankKind;
  /** Lightweight check: do these CSV headers look like this bank? */
  detect(headers: string[]): boolean;
  /** Fully sync parse. Decoded text in, normalized rows out. */
  parse(text: string): ParsedBankFile;
}

/** After normalize(): per-row hash added. sourceFileHash returned separately. */
export interface NormalizedRow extends ParsedRow {
  raw_row_hash: string;
}
