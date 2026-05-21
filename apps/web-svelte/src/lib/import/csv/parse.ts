// Generic CSV tokenizer. No Supabase, no async, no DOM.
// Handles quoted fields with escaped double-quotes ("" → "). Detects
// `;` vs `,` automatically by counting on the first non-comment line.
// Strips the optional UTF-8 BOM.

export interface CsvFile {
  /** Each row is an array of cells. First row is typically headers. */
  rows: string[][];
  /** Exact original text of each row (for hashing later via normalize.ts). */
  rowTexts: string[];
  /** Auto-detected separator. */
  separator: "," | ";";
}

export function parseCsv(input: string): CsvFile {
  let text = input;
  // Strip UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  // Split into raw lines first (handles \r\n + \n + \r).
  const lines = text.split(/\r\n|\n|\r/);
  // Trim trailing empty lines (a common artifact of file-end newline).
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  // Detect separator from first non-empty line. Prefer `;` since PL banks use it.
  const first = lines.find((l) => l.trim() !== "") ?? "";
  const semiCount = (first.match(/;/g) ?? []).length;
  const commaCount = (first.match(/,/g) ?? []).length;
  const separator: "," | ";" = semiCount >= commaCount ? ";" : ",";

  const rows: string[][] = [];
  const rowTexts: string[] = [];
  for (const line of lines) {
    if (line === "") {
      // Preserve position but skip empty rows from token list.
      continue;
    }
    rows.push(tokenizeRow(line, separator));
    rowTexts.push(line);
  }

  return { rows, rowTexts, separator };
}

/** Tokenize a single CSV line. Handles `"a;b"` quoted fields and `""` escapes. */
export function tokenizeRow(line: string, separator: "," | ";"): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === separator) {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  cells.push(current);
  return cells;
}
