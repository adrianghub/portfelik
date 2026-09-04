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
    const date = findIndex(row, ["Data operacji", "Data księgowania", "#Data operacji"]);
    const amount = findIndex(row, ["Kwota", "Kwota operacji", "#Kwota"]);
    const description = findIndex(row, ["Opis operacji", "Tytuł", "Opis"]);
    const counterparty = findIndex(row, ["Kontrahent", "Nadawca/Odbiorca", "Odbiorca"]);
    return date >= 0 && amount >= 0 && (description >= 0 || counterparty >= 0);
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

export const pkoBpAdapter: ImportAdapter = {
  kind: "pko_bp",
  sourceKind: "bank_statement",
  label: "PKO BP",
  aliases: ["pko", "ipko"],
  detect(input: AdapterDetectionInput): DetectionResult {
    const hasBrand = input.rows.some((row) =>
      row.some((cell) => /(^|\W)(pko bp|ipko)(\W|$)/i.test(cell))
    );
    if (!hasBrand) return null;
    return {
      kind: "pko_bp",
      confidence: findHeaderRowIndex(input.rows) >= 0 ? "medium" : "low",
      reason: "pko_brand_hint",
    };
  },
  parse(text: string): ParsedImportFile {
    const csv = parseCsv(text);
    const headerRowIdx = findHeaderRowIndex(csv.rows);
    if (headerRowIdx === -1) {
      return {
        kind: "pko_bp",
        rows: [],
        errors: [{ row_index: -1, reason: "pko_bp_required_columns_missing" }],
      };
    }
    const headers = csv.rows[headerRowIdx];
    const idx = {
      date: findIndex(headers, ["Data operacji", "Data księgowania", "#Data operacji"]),
      desc: findIndex(headers, ["Opis operacji", "Tytuł", "Opis"]),
      counterparty: findIndex(headers, ["Kontrahent", "Nadawca/Odbiorca", "Odbiorca"]),
      amount: findIndex(headers, ["Kwota", "Kwota operacji", "#Kwota"]),
      currency: findIndex(headers, ["Waluta", "Waluta operacji"]),
    };
    const parsed: ParsedRow[] = [];
    const errors: ParseError[] = [];
    for (let i = headerRowIdx + 1; i < csv.rows.length; i++) {
      const cells = csv.rows[i];
      if (!cells?.length || cells.every((c) => !c?.trim())) continue;
      const posted = parseDate(cells[idx.date] ?? "");
      const amountRaw = parsePlnAmount(cells[idx.amount] ?? "");
      if (!posted || amountRaw === null) {
        errors.push({ row_index: i - headerRowIdx - 1, reason: "pko_bp_invalid_row" });
        continue;
      }
      const type = amountRaw < 0 ? "expense" : "income";
      const description =
        collapseWs(idx.desc >= 0 ? (cells[idx.desc] ?? "") : "") ||
        collapseWs(idx.counterparty >= 0 ? (cells[idx.counterparty] ?? "") : "");
      parsed.push({
        posted_at: posted,
        amount: Math.abs(amountRaw),
        type,
        description: description || "Operacja bankowa",
        counterparty: idx.counterparty >= 0 ? collapseWs(cells[idx.counterparty] ?? "") : undefined,
        currency:
          idx.currency >= 0 ? (cells[idx.currency] ?? "").trim().toUpperCase() || "PLN" : "PLN",
        source_row_text: csv.rowTexts[i],
        row_index: i - headerRowIdx - 1,
      });
    }
    return { kind: "pko_bp", rows: parsed, errors };
  },
};
