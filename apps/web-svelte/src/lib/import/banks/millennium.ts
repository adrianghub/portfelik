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

function findHeaderRowIndex(rows: string[][]): number {
  return rows.findIndex((row) => {
    const date = findIndex(row, ["Data transakcji", "Data operacji", "Data księgowania"]);
    const description = findIndex(row, ["Opis transakcji", "Opis", "Tytuł"]);
    const counterparty = findIndex(row, ["Kontrahent", "Nadawca/Odbiorca"]);
    const signedAmount = findIndex(row, ["Kwota", "Kwota transakcji"]);
    const debit = findIndex(row, ["Obciążenia", "Kwota obciążenia"]);
    const credit = findIndex(row, ["Uznania", "Kwota uznania"]);
    return (
      date >= 0 &&
      (description >= 0 || counterparty >= 0) &&
      (signedAmount >= 0 || debit >= 0 || credit >= 0)
    );
  });
}

function parsePlnAmount(raw: string): number | null {
  const cleaned = raw.replace(/[\s\u00A0\u2009\u202F]/g, "").replace(",", ".");
  if (cleaned === "" || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function parseDate(raw: string): string | null {
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

export const millenniumAdapter: ImportAdapter = {
  kind: "millennium",
  sourceKind: "bank_statement",
  label: "Millennium",
  aliases: ["bank millennium"],
  detect(input: AdapterDetectionInput): DetectionResult {
    const hasBrand = input.rows.some((row) =>
      row.some((cell) => /(^|\W)(bank millennium|millennium)(\W|$)/i.test(cell))
    );
    if (!hasBrand) return null;
    return {
      kind: "millennium",
      confidence: findHeaderRowIndex(input.rows) >= 0 ? "medium" : "low",
      reason: "millennium_brand_hint",
    };
  },
  parse(text: string): ParsedImportFile {
    const csv = parseCsv(text);
    const headerRowIdx = findHeaderRowIndex(csv.rows);
    if (headerRowIdx === -1) {
      return {
        kind: "millennium",
        rows: [],
        errors: [{ row_index: -1, reason: "millennium_required_columns_missing" }],
      };
    }
    const headers = csv.rows[headerRowIdx];
    const idx = {
      date: findIndex(headers, ["Data transakcji", "Data operacji", "Data księgowania"]),
      desc: findIndex(headers, ["Opis transakcji", "Opis", "Tytuł"]),
      counterparty: findIndex(headers, ["Kontrahent", "Nadawca/Odbiorca"]),
      debit: findIndex(headers, ["Obciążenia", "Kwota obciążenia"]),
      credit: findIndex(headers, ["Uznania", "Kwota uznania"]),
      amount: findIndex(headers, ["Kwota", "Kwota transakcji"]),
      currency: findIndex(headers, ["Waluta", "Waluta transakcji"]),
    };
    const parsed: ParsedRow[] = [];
    const errors: ParseError[] = [];
    for (let i = headerRowIdx + 1; i < csv.rows.length; i++) {
      const cells = csv.rows[i];
      if (!cells?.length || cells.every((c) => !c?.trim())) continue;
      const posted = parseDate(cells[idx.date] ?? "");
      let amountRaw: number | null = null;
      let type: "income" | "expense" = "expense";
      if (idx.debit >= 0 || idx.credit >= 0) {
        const debit = parsePlnAmount(cells[idx.debit] ?? "");
        const credit = parsePlnAmount(cells[idx.credit] ?? "");
        if (debit !== null && debit !== 0) {
          amountRaw = Math.abs(debit);
          type = "expense";
        } else if (credit !== null && credit !== 0) {
          amountRaw = Math.abs(credit);
          type = "income";
        }
      }
      if (amountRaw === null && idx.amount >= 0) {
        const signed = parsePlnAmount(cells[idx.amount] ?? "");
        if (signed !== null) {
          amountRaw = Math.abs(signed);
          type = signed < 0 ? "expense" : "income";
        }
      }
      if (!posted || amountRaw === null) {
        errors.push({ row_index: i - headerRowIdx - 1, reason: "millennium_invalid_row" });
        continue;
      }
      const description = collapseWs(cells[idx.desc] ?? "");
      parsed.push({
        posted_at: posted,
        amount: amountRaw,
        type,
        description: description || "Operacja bankowa",
        counterparty: idx.counterparty >= 0 ? collapseWs(cells[idx.counterparty] ?? "") : undefined,
        currency:
          idx.currency >= 0 ? (cells[idx.currency] ?? "").trim().toUpperCase() || "PLN" : "PLN",
        source_row_text: csv.rowTexts[i],
        row_index: i - headerRowIdx - 1,
      });
    }
    return { kind: "millennium", rows: parsed, errors };
  },
};
