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
    const header = (input.rows[0] ?? []).join(";").toLowerCase();
    if (header.includes("millennium") || header.includes("bank millennium")) {
      return { kind: "millennium", confidence: "high", reason: "millennium_brand" };
    }
    const hasDate = header.includes("data transakcji") || header.includes("data operacji");
    const hasAmount =
      header.includes("kwota") || header.includes("obciążenia") || header.includes("uznania");
    if (hasDate && hasAmount) {
      return { kind: "millennium", confidence: "medium", reason: "millennium_layout" };
    }
    return null;
  },
  parse(text: string): ParsedImportFile {
    const { rows } = parseCsv(text);
    const headers = rows[0] ?? [];
    const idx = {
      date: findIndex(headers, ["Data transakcji", "Data operacji", "Data księgowania"]),
      desc: findIndex(headers, ["Opis transakcji", "Opis", "Tytuł"]),
      counterparty: findIndex(headers, ["Kontrahent", "Nadawca/Odbiorca"]),
      debit: findIndex(headers, ["Obciążenia", "Kwota obciążenia"]),
      credit: findIndex(headers, ["Uznania", "Kwota uznania"]),
      amount: findIndex(headers, ["Kwota", "Kwota transakcji"]),
    };
    const parsed: ParsedRow[] = [];
    const errors: ParseError[] = [];
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      if (!cells?.length || cells.every((c) => !c?.trim())) continue;
      const posted = parseDate(cells[idx.date] ?? "");
      let amountRaw: number | null = null;
      let type: "income" | "expense" = "expense";
      if (idx.debit >= 0 || idx.credit >= 0) {
        const debit = parsePlnAmount(cells[idx.debit] ?? "");
        const credit = parsePlnAmount(cells[idx.credit] ?? "");
        if (debit && debit > 0) {
          amountRaw = debit;
          type = "expense";
        } else if (credit && credit > 0) {
          amountRaw = credit;
          type = "income";
        }
      } else {
        const signed = parsePlnAmount(cells[idx.amount] ?? "");
        if (signed !== null) {
          amountRaw = Math.abs(signed);
          type = signed < 0 ? "expense" : "income";
        }
      }
      if (!posted || amountRaw === null) {
        errors.push({ row_index: i, reason: "invalid_row" });
        continue;
      }
      const description = collapseWs(cells[idx.desc] ?? "");
      parsed.push({
        posted_at: posted,
        amount: amountRaw,
        type,
        description: description || "Operacja bankowa",
        counterparty: idx.counterparty >= 0 ? collapseWs(cells[idx.counterparty] ?? "") : undefined,
        currency: "PLN",
        source_row_text: cells.join(";"),
        row_index: i - 1,
      });
    }
    return { kind: "millennium", rows: parsed, errors };
  },
};
