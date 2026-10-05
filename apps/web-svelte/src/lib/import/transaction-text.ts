/** Visual cleanup only. Preserve bank identifiers, numbers, locations and case. */
export function cleanTransactionText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** Keep raw, display and comparison text separate; never overwrite raw provenance. */
export function normalizeTransactionText(value: string | null | undefined): {
  raw: string;
  display: string;
  normalized: string;
} {
  const display = cleanTransactionText(value);
  return { raw: value ?? "", display, normalized: display.toLowerCase() };
}

export function suggestDescriptionRule(row: { description: string }): string {
  // Without a bank-specific, reliable merchant hint, retain the entire description.
  return cleanTransactionText(row.description);
}

export function suggestCounterpartyRule(row: { counterparty?: string | null }): string {
  // A missing counterparty must stay missing, even when the description has text.
  return cleanTransactionText(row.counterparty);
}

/** Combine bank description columns without treating blank columns as text. */
export function combineTransactionText(...parts: string[]): string {
  return parts.map(cleanTransactionText).filter(Boolean).join(" - ");
}
