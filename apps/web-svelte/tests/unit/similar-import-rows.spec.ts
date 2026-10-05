import { describe, expect, it } from "vitest";
import {
  areSimilarImportRows,
  groupSimilarImportRows,
  transactionSignature,
} from "$lib/import/similar-rows";

const row = {
  id: "1",
  type: "expense" as const,
  currency: "PLN",
  description: "KAWA CENTRUM",
  counterparty: "Kawiarnia",
  amount: 24,
};

describe("similar import rows", () => {
  it("groups cleaned complete fields across dates and amounts, retaining every row", () => {
    const other = { ...row, id: "2", description: "  kawa\nCENTRUM ", amount: 18 };
    expect(areSimilarImportRows(row, other)).toBe(true);
    expect(groupSimilarImportRows([row, other])).toEqual([[row, other]]);
  });
  it("does not group different merchants, substrings, currencies or directions", () => {
    for (const patch of [
      { description: "KAWA INNA" },
      { description: "KAWA CENTRUM EXTRA" },
      { counterparty: "Inna kawiarnia" },
      { currency: "EUR" },
      { type: "income" as const },
    ]) {
      expect(areSimilarImportRows(row, { ...row, ...patch })).toBe(false);
    }
    expect(
      areSimilarImportRows(
        { ...row, counterparty: "PAYU", description: "SKLEP A" },
        { ...row, counterparty: "PAYU", description: "SKLEP B" }
      )
    ).toBe(false);
  });
  it("uses edited descriptions and never groups missing text", () => {
    expect(areSimilarImportRows(row, { ...row, edited_description: "Inny zakup" })).toBe(false);
    expect(transactionSignature({ ...row, description: " " })).toBeNull();
    expect(
      groupSimilarImportRows([
        { ...row, description: "" },
        { ...row, id: "2", description: "" },
      ])
    ).toHaveLength(2);
  });
  it("keeps conflicting category and import decisions separately reviewable", () => {
    const other = { ...row, id: "2", selected_category_id: "transport", decision: "skip" };
    expect(areSimilarImportRows(row, other)).toBe(true);
    expect(groupSimilarImportRows([row, other])).toEqual([[row], [other]]);
  });
});
