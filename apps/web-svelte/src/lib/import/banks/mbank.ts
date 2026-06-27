// mBank CSV adapter - based on the standard "Historia operacji" export.
//
// Columns vary by export layout; we locate them by header name, not position.
//   #Data operacji     - operation date (we use this as posted_at)
//   #Data księgowania  - booking date (fallback when operation date absent)
//   #Opis operacji     - primary description
//   #Tytuł             - secondary description / counterparty memo (older layout)
//   #Nadawca/Odbiorca  - counterparty (older layout)
//   #Kwota             - signed amount (negative = expense)
//
// The 2026 "Lista operacji" export drops #Tytuł/#Nadawca/Odbiorca, adds
// #Rachunek/#Kategoria, and suffixes #Kwota with a currency code
// (e.g. "14 000,00 PLN"). parsePlnAmount strips the suffix.
//
// Sign convention: amount column carries the sign; negative → expense.
// Encoding: typically Windows-1250 (decode.ts handles).
// Separator: `;`.

import { parseCsv } from "../csv/parse";
import type {
  AdapterDetectionInput,
  DetectionResult,
  ImportAdapter,
  ParseError,
  ParsedImportFile,
  ParsedRow,
} from "./types";

const HEADER_HINT = "#Opis operacji";

function findIndex(headers: string[], candidates: string[]): number {
  for (const cand of candidates) {
    const i = headers.findIndex((h) => h.trim().toLowerCase() === cand.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
}

function parsePlnAmount(raw: string): number | null {
  // mBank uses comma as decimal separator and space thousands; the 2026 export
  // also appends a currency code (e.g. "14 000,00 PLN"). Strip everything that
  // isn't a digit, sign, or separator before validating.
  const cleaned = raw.replace(/[^\d,.-]/g, "").replace(",", ".");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function parseDate(raw: string): string | null {
  // Accept yyyy-mm-dd or dd-mm-yyyy or dd.mm.yyyy.
  const t = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[.-](\d{2})[.-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export const mbankAdapter: ImportAdapter = {
  kind: "mbank",
  sourceKind: "bank_statement",
  label: "mBank",

  detect({ rows }: AdapterDetectionInput): DetectionResult {
    const hit = rows.some((row) =>
      row.some((h) => h.trim().toLowerCase().startsWith("#opis operacji"))
    );
    return hit
      ? { kind: "mbank", confidence: "high", reason: "mBank '#Opis operacji' header" }
      : null;
  },

  parse(text: string): ParsedImportFile {
    const csv = parseCsv(text);

    // mBank prefixes the table with a few metadata lines before the real header.
    // Find the row that contains HEADER_HINT and treat everything after it as data.
    const headerRowIdx = csv.rows.findIndex((row) =>
      row.some((cell) => cell.trim().toLowerCase() === HEADER_HINT.toLowerCase())
    );
    if (headerRowIdx === -1) {
      return {
        kind: "mbank",
        rows: [],
        errors: [{ row_index: -1, reason: "mbank_header_not_found" }],
      };
    }

    const headers = csv.rows[headerRowIdx];
    const idx = {
      dateOp: findIndex(headers, ["#Data operacji", "Data operacji"]),
      dateBook: findIndex(headers, ["#Data księgowania", "Data księgowania"]),
      opis: findIndex(headers, ["#Opis operacji", "Opis operacji"]),
      tytul: findIndex(headers, ["#Tytuł", "Tytuł"]),
      counterparty: findIndex(headers, ["#Nadawca/Odbiorca", "Nadawca/Odbiorca"]),
      amount: findIndex(headers, ["#Kwota", "Kwota"]),
    };

    if (idx.opis === -1 || idx.amount === -1) {
      return {
        kind: "mbank",
        rows: [],
        errors: [{ row_index: headerRowIdx, reason: "mbank_required_columns_missing" }],
      };
    }

    const rows: ParsedRow[] = [];
    const errors: ParseError[] = [];

    for (let r = headerRowIdx + 1; r < csv.rows.length; r++) {
      const cells = csv.rows[r];
      const rawLine = csv.rowTexts[r];
      const localIndex = r - headerRowIdx - 1;
      if (cells.length === 1 && cells[0].trim() === "") continue;

      const dateRaw = (idx.dateOp !== -1 ? cells[idx.dateOp] : cells[idx.dateBook]) ?? "";
      const posted_at = parseDate(dateRaw);
      if (!posted_at) {
        errors.push({ row_index: localIndex, reason: "mbank_invalid_date" });
        continue;
      }

      const amt = parsePlnAmount(cells[idx.amount] ?? "");
      if (amt === null) {
        errors.push({ row_index: localIndex, reason: "mbank_invalid_amount" });
        continue;
      }

      const type = amt < 0 ? "expense" : "income";
      const amount = Math.abs(amt);

      const opis = idx.opis !== -1 ? (cells[idx.opis] ?? "") : "";
      const tytul = idx.tytul !== -1 ? (cells[idx.tytul] ?? "") : "";
      const description = collapseWs([opis, tytul].filter(Boolean).join(" - "));
      const counterparty =
        idx.counterparty !== -1 ? collapseWs(cells[idx.counterparty] ?? "") : undefined;

      rows.push({
        posted_at,
        amount,
        type,
        description: description || "(brak opisu)",
        counterparty: counterparty || undefined,
        external_id: undefined, // mBank "Historia operacji" does not export an op id
        currency: "PLN",
        source_row_text: rawLine,
        row_index: localIndex,
      });
    }

    return { kind: "mbank", rows, errors } satisfies ParsedImportFile;
  },
};
