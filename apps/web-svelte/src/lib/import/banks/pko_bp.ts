import { parseCsv } from "../csv/parse";
import type {
  AdapterDetectionInput,
  DetectionResult,
  ImportAdapter,
  ParseError,
  ParsedImportFile,
  ParsedRow,
} from "./types";

const HEADER_HINTS = ["#data operacji", "data operacji", "kwota"];

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

export const pkoBpAdapter: ImportAdapter = {
  kind: "pko_bp",
  sourceKind: "bank_statement",
  label: "PKO BP",
  aliases: ["pko", "ipko"],
  detect(input: AdapterDetectionInput): DetectionResult {
    const header = (input.rows[0] ?? []).join(";").toLowerCase();
    const hits = HEADER_HINTS.filter((h) => header.includes(h)).length;
    if (hits >= 2) return { kind: "pko_bp", confidence: "medium", reason: "pko_header_match" };
    if (header.includes("pko") || header.includes("ipko")) {
      return { kind: "pko_bp", confidence: "low", reason: "pko_name_hint" };
    }
    return null;
  },
  parse(text: string): ParsedImportFile {
    const { rows } = parseCsv(text);
    const headers = rows[0] ?? [];
    const idx = {
      date: findIndex(headers, ["Data operacji", "Data księgowania", "#Data operacji"]),
      desc: findIndex(headers, ["Opis operacji", "Tytuł", "Opis"]),
      counterparty: findIndex(headers, ["Kontrahent", "Nadawca/Odbiorca", "Odbiorca"]),
      amount: findIndex(headers, ["Kwota", "Kwota operacji", "#Kwota"]),
    };
    const parsed: ParsedRow[] = [];
    const errors: ParseError[] = [];
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i];
      if (!cells?.length || cells.every((c) => !c?.trim())) continue;
      const posted = parseDate(cells[idx.date] ?? "");
      const amountRaw = parsePlnAmount(cells[idx.amount] ?? "");
      if (!posted || amountRaw === null) {
        errors.push({ row_index: i, reason: "invalid_row" });
        continue;
      }
      const type = amountRaw < 0 ? "expense" : "income";
      const description = collapseWs(cells[idx.desc] ?? cells[idx.counterparty] ?? "");
      parsed.push({
        posted_at: posted,
        amount: Math.abs(amountRaw),
        type,
        description: description || "Operacja bankowa",
        counterparty: idx.counterparty >= 0 ? collapseWs(cells[idx.counterparty] ?? "") : undefined,
        currency: "PLN",
        source_row_text: cells.join(";"),
        row_index: i - 1,
      });
    }
    return { kind: "pko_bp", rows: parsed, errors };
  },
};
