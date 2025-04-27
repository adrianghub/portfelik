/**
 * Helper function to normalize text for filtering
 * Removes diacritics, handles whitespace, and performs case-insensitive comparison
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
