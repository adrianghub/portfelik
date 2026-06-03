// Async post-parse step: add raw_row_hash to each parsed row + return the
// overall sourceFileHash. Keeps SHA-256 work out of the sync parse() path.
//
// Uses Web Crypto (browser + Node 22+). Both available in the runtime targets
// the app ships to (browser via Vite, vitest via Node).

import type { NormalizedRow, ParsedImportFile, ParseError } from "./banks/types";

async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < view.length; i++) {
    hex += view[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export interface NormalizedFile {
  rows: NormalizedRow[];
  errors: ParseError[];
  sourceFileHash: string;
}

export async function normalize(
  parsed: ParsedImportFile,
  fileBytes: ArrayBuffer
): Promise<NormalizedFile> {
  const sourceFileHash = await sha256Hex(fileBytes);
  const rows: NormalizedRow[] = [];
  const errors: ParseError[] = [...parsed.errors];
  for (const r of parsed.rows) {
    if (!(r.amount > 0)) {
      errors.push({ row_index: r.row_index, reason: "non_positive_amount" });
      continue;
    }
    const raw_row_hash = await sha256Hex(r.source_row_text);
    rows.push({ ...r, raw_row_hash });
  }
  return { rows, errors, sourceFileHash };
}
