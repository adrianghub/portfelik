import type { NormalizedRow } from "$lib/import/banks/types";
import { getImportAdapter } from "$lib/import/banks/registry";
import { decodeBankCsv } from "$lib/import/csv/decode";
import { normalize } from "$lib/import/normalize";

export const DEMO_SAMPLE_URL = "/sample-imports/jakstoimy-demo.csv";
export const DEMO_SAMPLE_SHA256 =
  "9f0c0c3d843c27587b30654f594dad709062a53e82c76ca3af2e7ac3cd120c55";
// Fictional cash before the first fixture movement, persisted in the normal model.
export const DEMO_SAMPLE_OPENING = {
  opening_amount: 5000,
  as_of_date: "2026-05-01",
  balance_semantics: "start_of_day",
} as const;

/** Used only for the pinned fictional fixture, never as a general import rule. */
export function demoSampleCategory(row: Pick<NormalizedRow, "description" | "type">): string {
  const text = row.description.toUpperCase();
  if (row.type === "income") {
    if (text.includes("WYNAGRODZENIE")) return "Wynagrodzenie";
    if (text.includes("ZWROT")) return "Zwrot";
  } else {
    if (/BIEDRONKA|LIDL/.test(text)) return "Jedzenie i zakupy";
    if (/CZYNSZ|KREDYTU HIPOTECZNEGO/.test(text)) return "Mieszkanie";
    if (/NETFLIX|SPOTIFY/.test(text)) return "Subskrypcje";
    if (/MPK|ORLEN/.test(text)) return "Transport";
    if (/ROSSMANN|APTEKA/.test(text)) return "Zdrowie";
    if (text.includes("ALLEGRO")) return "Zakupy online";
    if (text.includes("RESTAURACJA")) return "Restauracje";
    if (/OSZCZEDNOSCI|BANKOMATU/.test(text)) return "Finanse";
  }
  throw new Error("demo_sample_unmapped_row");
}

export async function prepareDemoSample(bytes: ArrayBuffer) {
  const file = await normalize(getImportAdapter("erste").parse(decodeBankCsv(bytes)), bytes);
  if (file.sourceFileHash !== DEMO_SAMPLE_SHA256 || file.errors.length || file.rows.length !== 96) {
    throw new Error("demo_sample_invalid");
  }
  const totals = { income: 0, expense: 0 };
  for (const row of file.rows) {
    if (row.currency !== "PLN" || row.is_hold) throw new Error("demo_sample_invalid");
    totals[row.type] += Math.round(row.amount * 100);
    demoSampleCategory(row);
  }
  if (totals.income !== 6150000 || totals.expense !== 3676584)
    throw new Error("demo_sample_invalid");
  return file;
}
