import { describe, expect, it } from "vitest";
import { analysisBalanceHelp } from "$lib/analysis/balance-help";

describe("analysis balance help", () => {
  it("calls an end-of-day amount confirmed and keeps the import limit", () => {
    const text = analysisBalanceHelp({
      reconstructed: true,
      semantics: "end_of_day",
      anchorDate: "2026-10-13",
      clippedFrom: "2026-08-09",
    });
    expect(text).toContain("potwierdzone na koniec dnia");
    expect(text).toContain("13.10");
    expect(text).toContain("różnić od salda bankowego");
    expect(text).toContain("9.08");
    expect(text).not.toContain("Odtworzone");
  });

  it("does not call a start-of-day amount a checked bank balance", () => {
    const text = analysisBalanceHelp({
      reconstructed: true,
      semantics: "start_of_day",
      anchorDate: "2026-09-01",
      clippedFrom: null,
    });
    expect(text).toContain("początek dnia");
    expect(text).toContain("1.09");
    expect(text).toContain("Nie jest to sprawdzone saldo bankowe");
    expect(text).not.toContain("potwierdzone na koniec dnia");
  });
});
