import { decodeBankCsv } from "./csv/decode";
import { detectImportAdapter, getImportAdapter } from "./banks/registry";
import type { ImportAdapterKind } from "./banks/types";
import { normalize } from "./normalize";
import {
  normalizeTransactionText,
  suggestDescriptionRule,
  suggestCounterpartyRule,
} from "./transaction-text";

/** Local diagnostics only: no backend, telemetry, mutations or merchant guessing. */
export async function inspectBankCsv(bytes: ArrayBuffer, bank?: ImportAdapterKind, limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error("invalid_inspect_limit");
  const text = decodeBankCsv(bytes);
  const detection = detectImportAdapter(text);
  const kind = bank ?? detection?.kind;
  if (!kind) throw new Error("unknown_bank: specify --bank");
  const parsed = getImportAdapter(kind).parse(text);
  const normalized = await normalize(parsed, bytes);
  const original = new Map(parsed.rows.map((row) => [row.row_index, row]));
  return {
    bank: kind,
    detection,
    rows_total: normalized.rows.length,
    errors: normalized.errors,
    rows: normalized.rows.slice(0, limit).map((row) => ({
      row_index: row.row_index,
      raw_row: row.source_row_text,
      bank_fields: row.text_fields,
      parsed: {
        description: original.get(row.row_index)!.description,
        counterparty: original.get(row.row_index)!.counterparty ?? null,
      },
      normalized: {
        description: normalizeTransactionText(row.description),
        counterparty: normalizeTransactionText(row.counterparty),
      },
      rule_suggestion: {
        description: suggestDescriptionRule(row),
        counterparty: suggestCounterpartyRule(row) || null,
      },
    })),
  };
}
