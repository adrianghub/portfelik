// mBank CSV adapter - based on the standard "Historia operacji" export.
//
// Documented columns (Polish headers, varies slightly year-to-year):
//   #Data księgowania  - booking date
//   #Data operacji     - operation date (we use this as posted_at)
//   #Opis operacji     - primary description
//   #Tytuł             - secondary description / counterparty memo
//   #Nadawca/Odbiorca  - counterparty
//   #Numer konta       - counterparty account
//   #Kwota             - signed amount (negative = expense)
//   #Saldo po operacji - running balance (ignored)
//
// Sign convention: amount column carries the sign; negative → expense.
// Encoding: typically Windows-1250 (decode.ts handles).
// Separator: `;`.
//
// FIXTURE STATUS: behavior verified against synthetic minimal fixtures
// (tests/import/fixtures/mbank/). Validation against real anonymized
// mBank exports is a step-2.5 task; behavior here is provisional.

import { parseCsv } from "../csv/parse";
import type { BankAdapter, ParseError, ParsedBankFile, ParsedRow } from "./types";

const HEADER_HINT = "#Opis operacji";

function findIndex(headers: string[], candidates: string[]): number {
  for (const cand of candidates) {
    const i = headers.findIndex((h) => h.trim().toLowerCase() === cand.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
}

function parsePlnAmount(raw: string): number | null {
  // mBank uses comma as decimal separator and may include thin-space thousands.
  const cleaned = raw.replace(/[\s\u00A0\u2009\u202F]/g, "").replace(",", ".");
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

export const mbankAdapter: BankAdapter = {
  kind: "mbank",

  detect(headers: string[]): boolean {
    return headers.some((h) => h.trim().toLowerCase().startsWith("#opis operacji"));
  },

  parse(text: string): ParsedBankFile {
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

    return { kind: "mbank", rows, errors };
  },
};
