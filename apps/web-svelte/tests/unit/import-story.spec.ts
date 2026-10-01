import { describe, expect, it } from "vitest";
import { describeImportedMoney, importStoryAfterCommit } from "$lib/content/import-story";
import { formatCurrency } from "$lib/utils";

describe("describeImportedMoney", () => {
  it("says what left and which pile took the most", () => {
    const story = describeImportedMoney([
      { type: "expense", amount: 1800, categoryName: "Wakacje" },
      { type: "expense", amount: 600, categoryName: "Zakupy" },
    ]);
    expect(story).toBe(
      `Wydatki: ${formatCurrency(2400)}. Najwięcej w kategorii Wakacje: ${formatCurrency(1800)}.`
    );
  });

  it("mentions money that came in", () => {
    const story = describeImportedMoney([
      { type: "income", amount: 5000, categoryName: "Wypłata" },
      { type: "expense", amount: 200, categoryName: "Zakupy" },
    ]);
    expect(story).toBe(
      `Wpływy: ${formatCurrency(5000)}. Wydatki: ${formatCurrency(200)}. Najwięcej w kategorii Zakupy: ${formatCurrency(200)}.`
    );
  });

  it("stays quiet when the file added nothing", () => {
    expect(describeImportedMoney([])).toBeNull();
  });

  it("does not tell a story from rows the commit rejected", () => {
    const stale = [{ type: "expense" as const, amount: 100, categoryName: "Zakupy" }];
    expect(
      importStoryAfterCommit({
        duplicatesCommit: 1,
        lines: stale,
        fromCommittedRows: false,
      })
    ).toBeNull();
  });

  it("uses only the rows that stayed after commit", () => {
    const committed = [{ type: "expense" as const, amount: 40, categoryName: "Zakupy" }];
    expect(
      importStoryAfterCommit({
        duplicatesCommit: 1,
        lines: committed,
        fromCommittedRows: true,
      })
    ).toBe(`Wydatki: ${formatCurrency(40)}. Najwięcej w kategorii Zakupy: ${formatCurrency(40)}.`);
  });
});
