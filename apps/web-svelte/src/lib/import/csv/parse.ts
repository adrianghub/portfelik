// Generic CSV tokenizer. No Supabase, no async, no DOM.
// Handles quoted fields (including embedded newlines) with escaped double-quotes
// ("" → "). Detects `;` vs `,` from multiple logical records so a metadata
// preamble cannot select the wrong delimiter. Strips the optional UTF-8 BOM.

export interface CsvFile {
  /** Each row is an array of cells. First row is typically headers. */
  rows: string[][];
  /** Exact original text of each logical CSV record (for hashing in normalize.ts). */
  rowTexts: string[];
  /** Auto-detected separator. */
  separator: "," | ";";
}

export function parseCsv(input: string): CsvFile {
  let text = input;
  // Strip UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records = splitCsvRecords(text);

  // Inspect several logical records, ignoring separators inside quotes. Bank
  // exports commonly start with a one-cell brand/account preamble.
  const candidates = records.filter((record) => record.trim() !== "").slice(0, 20);
  const semiCount = candidates.reduce((sum, record) => sum + countUnquoted(record, ";"), 0);
  const commaCount = candidates.reduce((sum, record) => sum + countUnquoted(record, ","), 0);
  const separator: "," | ";" = semiCount >= commaCount ? ";" : ",";

  const rows: string[][] = [];
  const rowTexts: string[] = [];
  for (const record of records) {
    if (record === "") continue;
    rows.push(tokenizeRow(record, separator));
    rowTexts.push(record);
  }

  return { rows, rowTexts, separator };
}

/** Split physical lines only when outside a quoted field. */
function splitCsvRecords(text: string): string[] {
  const records: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      current += ch;
      if (inQuotes && text[i + 1] === '"') {
        current += text[i + 1];
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      records.push(current);
      current = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
      continue;
    }

    current += ch;
  }

  records.push(current);
  while (records.length > 0 && records[records.length - 1] === "") records.pop();
  return records;
}

function countUnquoted(record: string, separator: "," | ";"): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < record.length; i++) {
    const ch = record[i];
    if (ch === '"') {
      if (inQuotes && record[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && ch === separator) {
      count++;
    }
  }
  return count;
}

/** Tokenize one logical CSV record. Handles quoted fields, newlines and `""` escapes. */
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
