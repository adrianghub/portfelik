// Erste Bank Polska (dawniej Santander) CSV adapter.
//
// Format: HEADERLESS, comma-delimited, 9 columns. There is no column-name row,
// so detection is structural (this is the manual-selection motivator).
//
//   col1 Data transakcji   dd-mm-yyyy            → posted_at
//   col2 Data księgowania                        (ignored)
//   col3 Tytuł                                   → description
//   col4 Kontrahent                              → counterparty
//   col5 Nr rachunku kontrahenta (IBAN)          (ignored; currency on summary row)
//   col6 Kwota             "-4140,00" signed      → amount + type (neg = expense)
//   col7 blokada/saldo     "0,00"                 (ignored)
//   col8 Lp                statement sequence     NOT external_id (suppressed)
//   col9 (empty)                                  (ignored)
//
// The first physical line is an account/summary row: col1 is yyyy-mm-dd, col5 is
// a 3-letter currency code (not an IBAN), col6 is 0,00, col8 is the row count.
// row_index is the PHYSICAL parsed row index (summary row consumes index 0) so
// (source_file_hash, source_row_index) stays tied to the original file
// coordinate. Lp is statement-level → never used as external_id; Erste rows
// hard-dedupe only via (user_id, bank_account_id, source_file_hash, row_index).

import { parseCsv } from "../csv/parse";
import type {
  AdapterDetectionInput,
  DetectionResult,
  ImportAdapter,
  ParseError,
  ParsedImportFile,
  ParsedRow,
} from "./types";

const CURRENCY_RE = /^[A-Z]{3}$/;
const DATE_DMY_RE = /^(\d{2})[.-](\d{2})[.-](\d{4})$/;
const AMOUNT_RE = /^-?\d+,\d{2}$/;

function parseAmount(raw: string): number | null {
  const cleaned = (raw ?? "").replace(/[\s\u00A0\u2009\u202F]/g, "").replace(",", ".");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

// Transaction rows use dd-mm-yyyy (or dd.mm.yyyy) only. The summary row's
// yyyy-mm-dd date is never parsed because that row is skipped via isSummaryRow.
function parseDate(raw: string): string | null {
  const m = DATE_DMY_RE.exec((raw ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** A summary/account row: 5th field is a bare currency code, not an IBAN. */
function isSummaryRow(cells: string[]): boolean {
  return CURRENCY_RE.test((cells[4] ?? "").trim());
}

export const ersteAdapter: ImportAdapter = {
  kind: "erste",
  sourceKind: "bank_statement",
  label: "Erste Bank Polska (dawniej Santander)",
  aliases: ["santander"],

  detect({ text }: AdapterDetectionInput): DetectionResult {
    const csv = parseCsv(text);
    if (csv.separator !== ",") return null;
    const rows = csv.rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));

    // Count rows shaped like an Erste transaction: ≥8 cols, dd-mm-yyyy date in
    // col1, signed comma amount in col6. The leading account/summary row
    // (yyyy-mm-dd + currency in col5) is optional - it is skipped during parse
    // and is NOT required for detection, so a summary-less export still matches.
    // A short trailing row simply doesn't count toward the threshold.
    const txLike = rows.filter(
      (r) =>
        r.length >= 8 &&
        DATE_DMY_RE.test((r[0] ?? "").trim()) &&
        AMOUNT_RE.test((r[5] ?? "").trim())
    );

    if (txLike.length >= 2) {
      return {
        kind: "erste",
        confidence: "medium",
        reason: "headerless 9-col Erste/Santander layout",
      };
    }
    return null;
  },

  parse(text: string): ParsedImportFile {
    const csv = parseCsv(text);
    const rows: ParsedRow[] = [];
    const errors: ParseError[] = [];

    for (let r = 0; r < csv.rows.length; r++) {
      const cells = csv.rows[r];
      const rawLine = csv.rowTexts[r];
      if (cells.length === 1 && cells[0].trim() === "") continue;
      if (isSummaryRow(cells)) continue; // skip account/summary row, keep its index

      const posted_at = parseDate(cells[0] ?? "");
      if (!posted_at) {
        errors.push({ row_index: r, reason: "erste_invalid_date" });
        continue;
      }

      const signed = parseAmount(cells[5] ?? "");
      if (signed === null) {
        errors.push({ row_index: r, reason: "erste_invalid_amount" });
        continue;
      }

      const type = signed < 0 ? "expense" : "income";
      const description = collapseWs(cells[2] ?? "") || "(brak opisu)";
      const counterparty = collapseWs(cells[3] ?? "");

      rows.push({
        posted_at,
        amount: Math.abs(signed),
        type,
        description,
        counterparty: counterparty || undefined,
        external_id: undefined, // col8 Lp is statement-level → never used for dedupe
        currency: "PLN",
        source_row_text: rawLine,
        row_index: r, // physical parsed index (summary row consumed index 0)
      });
    }

    return { kind: "erste", rows, errors };
  },
};
