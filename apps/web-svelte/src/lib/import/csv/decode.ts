// Encoding sniff for bank CSV files. Polish banks ship UTF-8 (with or without
// BOM) or Windows-1250 — sometimes inside the same export over the years.
// Returns decoded text; caller passes the same bytes to normalize() for the
// file hash.

/**
 * Sniff and decode. Strategy:
 *   1. UTF-8 BOM → utf-8.
 *   2. Try utf-8 strict (replacement-char heuristic). If the result contains
 *      the U+FFFD replacement character anywhere, fall back to Windows-1250.
 *   3. Otherwise keep utf-8.
 */
export function decodeBankCsv(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);

  // UTF-8 BOM check.
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(view.subarray(3));
  }

  // Try UTF-8 with fatal=false; if replacement chars appear, fall back.
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(view);
  if (!utf8.includes("�")) {
    return utf8;
  }

  // Windows-1250 covers PL (ą ę ć ł ń ó ś ź ż).
  return new TextDecoder("windows-1250").decode(view);
}
