// ING Bank Śląski CSV adapter - based on the "Historia rachunku" export.
//
// Documented columns (Polish headers; layout shifts year-to-year):
//   "Data transakcji" - operation date
//   "Data księgowania" - booking date
//   "Dane kontrahenta" - counterparty
//   "Tytuł" - description
//   "Nr rachunku" - counterparty account
//   "Nazwa banku" - bank name
//   "Szczegóły" - details
//   "Nr transakcji" - bank's operation id (becomes external_id)
//   "Kwota transakcji (waluta rachunku)" - signed amount in account currency
//     (some exports split into "Kwota debetu" / "Kwota kredytu" - handle both)
//   "Waluta" - currency
//
// Sign convention: either signed Kwota column OR separate debit/credit
//   columns. Both supported.
// Encoding: typically UTF-8, occasionally Windows-1250 (decode.ts handles).
// Separator: `;`.
//
// FIXTURE STATUS: behavior verified against synthetic fixtures. Validation
// against real anonymized ING exports is a step-2.5 task; provisional.

import { parseCsv } from "../csv/parse";
import type {
  AdapterDetectionInput,
  DetectionResult,
  ImportAdapter,
  ParseError,
  ParsedImportFile,
  ParsedRow,
} from "./types";

function findIndex(headers: string[], candidates: string[]): number {
  for (const cand of candidates) {
    const i = headers.findIndex((h) => h.trim().toLowerCase() === cand.toLowerCase());
    if (i !== -1) return i;
  }
  return -1;
}

function parseAmount(raw: string): number | null {
  const cleaned = (raw ?? "").replace(/[\s\u00A0\u2009\u202F]/g, "").replace(",", ".");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function parseDate(raw: string): string | null {
  const t = (raw ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[.-](\d{2})[.-](\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function hasTransactionSignal(cells: string[], idx: Record<string, number>): boolean {
  const values = [
    idx.counterparty,
    idx.title,
    idx.details,
    idx.external,
    idx.amountSigned,
    idx.debit,
    idx.credit,
    idx.amountBlock,
  ]
    .filter((i) => i !== -1)
    .map((i) => cells[i]?.trim() ?? "");

  return values.some((value) => value !== "");
}

function suppressConstantExternalIds(rows: ParsedRow[]): ParsedRow[] {
  const ids = rows.map((row) => row.external_id).filter((id): id is string => !!id);
  if (ids.length <= 1) return rows;

  // Some ING exports use the "Nr transakcji" column as a statement/list id
  // repeated on every row. That value is not transaction-unique and would make
  // hard dedupe collapse the whole statement into one row.
  if (new Set(ids).size === 1) {
    return rows.map((row) => ({ ...row, external_id: undefined }));
  }

  return rows;
}

export const ingAdapter: ImportAdapter = {
  kind: "ing",
  sourceKind: "bank_statement",
  label: "ING Bank Śląski",

  detect({ rows }: AdapterDetectionInput): DetectionResult {
    const hit = rows.some((row) =>
      row.some((cell) => {
        const c = cell.trim().toLowerCase();
        return c === "data transakcji" || c.startsWith("kwota transakcji") || c === "nr transakcji";
      })
    );
    return hit
      ? {
          kind: "ing",
          confidence: "high",
          reason: "ING 'Data transakcji'/'Kwota transakcji'/'Nr transakcji' header",
        }
      : null;
  },

  parse(text: string): ParsedImportFile {
    const csv = parseCsv(text);

    // ING also has a metadata preamble. Find the header row by hint.
    const headerRowIdx = csv.rows.findIndex((row) =>
      row.some((cell) => {
        const c = cell.trim().toLowerCase();
        return c === "data transakcji" || c.startsWith("kwota transakcji") || c === "nr transakcji";
      })
    );
    if (headerRowIdx === -1) {
      return {
        kind: "ing",
        rows: [],
        errors: [{ row_index: -1, reason: "ing_header_not_found" }],
      };
    }

    const headers = csv.rows[headerRowIdx];
    const idx = {
      dateOp: findIndex(headers, ["Data transakcji"]),
      dateBook: findIndex(headers, ["Data księgowania"]),
      counterparty: findIndex(headers, ["Dane kontrahenta"]),
      title: findIndex(headers, ["Tytuł"]),
      details: findIndex(headers, ["Szczegóły"]),
      external: findIndex(headers, ["Nr transakcji"]),
      currency: findIndex(headers, ["Waluta"]),
      amountSigned: headers.findIndex((h) => h.trim().toLowerCase().startsWith("kwota transakcji")),
      debit: findIndex(headers, ["Kwota debetu"]),
      credit: findIndex(headers, ["Kwota kredytu"]),
      amountBlock: findIndex(headers, ["Kwota blokady/zwolnienie blokady"]),
    };

    if ((idx.dateOp === -1 && idx.dateBook === -1) || idx.title === -1) {
      return {
        kind: "ing",
        rows: [],
        errors: [{ row_index: headerRowIdx, reason: "ing_required_columns_missing" }],
      };
    }

    const rows: ParsedRow[] = [];
    const errors: ParseError[] = [];

    for (let r = headerRowIdx + 1; r < csv.rows.length; r++) {
      const cells = csv.rows[r];
      const rawLine = csv.rowTexts[r];
      const localIndex = r - headerRowIdx - 1;
      if (cells.length === 1 && cells[0].trim() === "") continue;
      if (!hasTransactionSignal(cells, idx)) continue;

      const dateRaw =
        (idx.dateOp !== -1 ? cells[idx.dateOp] : undefined) ??
        (idx.dateBook !== -1 ? cells[idx.dateBook] : "");
      const posted_at = parseDate(dateRaw ?? "");
      if (!posted_at) {
        errors.push({ row_index: localIndex, reason: "ing_invalid_date" });
        continue;
      }

      let signed: number | null = null;
      let isHold = false;
      if (idx.amountSigned !== -1) {
        signed = parseAmount(cells[idx.amountSigned] ?? "");
      }
      if (signed === null && (idx.debit !== -1 || idx.credit !== -1)) {
        const debit = idx.debit !== -1 ? parseAmount(cells[idx.debit] ?? "") : null;
        const credit = idx.credit !== -1 ? parseAmount(cells[idx.credit] ?? "") : null;
        if (debit !== null && debit !== 0) signed = -Math.abs(debit);
        else if (credit !== null && credit !== 0) signed = Math.abs(credit);
      }
      if (signed === null && idx.amountBlock !== -1) {
        const block = parseAmount(cells[idx.amountBlock] ?? "");
        if (block !== null && block !== 0) {
          signed = block; // negative = hold, positive = release
          isHold = true;
        }
      }
      if (signed === null) {
        errors.push({ row_index: localIndex, reason: "ing_invalid_amount" });
        continue;
      }

      const type = signed < 0 ? "expense" : "income";
      const amount = Math.abs(signed);

      const counterparty = idx.counterparty !== -1 ? collapseWs(cells[idx.counterparty] ?? "") : "";
      const titleRaw = idx.title !== -1 ? (cells[idx.title] ?? "") : "";
      const detailsRaw = idx.details !== -1 ? (cells[idx.details] ?? "") : "";
      const description =
        collapseWs([titleRaw, detailsRaw].filter(Boolean).join(" - ")) || "(brak opisu)";
      const external_id = idx.external !== -1 ? (cells[idx.external] ?? "").trim() : "";

      const currency =
        idx.currency !== -1 ? (cells[idx.currency] ?? "").trim().toUpperCase() || "PLN" : "PLN";

      rows.push({
        posted_at,
        amount,
        type,
        description,
        counterparty: counterparty || undefined,
        external_id: external_id || undefined,
        currency,
        source_row_text: rawLine,
        row_index: localIndex,
        is_hold: isHold || undefined,
      });
    }

    return {
      kind: "ing",
      rows: suppressConstantExternalIds(rows),
      errors,
    } satisfies ParsedImportFile;
  },
};
