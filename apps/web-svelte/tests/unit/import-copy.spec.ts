import { describe, expect, it } from "vitest";
import { importActionLabel, importSuccessLabel } from "$lib/content/import-copy";

describe("Polish import transaction counts", () => {
  it.each([
    [0, "transakcji"],
    [1, "transakcję"],
    [2, "transakcje"],
    [4, "transakcje"],
    [5, "transakcji"],
    [12, "transakcji"],
    [14, "transakcji"],
    [21, "transakcji"],
    [22, "transakcje"],
    [24, "transakcje"],
    [112, "transakcji"],
  ])("declines count %i in both import messages", (count, noun) => {
    expect(importActionLabel(Number(count))).toBe(`Zaimportuj ${count} ${noun}`);
    expect(importSuccessLabel(Number(count))).toBe(`Dodano ${count} ${noun}`);
  });
});
