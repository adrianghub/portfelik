import { describe, expect, it } from "vitest";
import {
  matchRule,
  findDuplicateCategorizationRule,
  suggestRuleFromRow,
} from "$lib/import/categorize";
import {
  normalizeTransactionText,
  suggestCounterpartyRule,
  suggestDescriptionRule,
} from "$lib/import/transaction-text";
import type { CategorizationRule } from "$lib/types";

const row = {
  type: "expense" as const,
  description: "NETFLIX.COM AMSTERDAM",
  counterparty: "Netflix International",
  posted_at: "2026-10-04",
};
const base: CategorizationRule = {
  id: "rule",
  user_id: "user",
  created_at: "",
  priority: 0,
  kind: "contains",
  match_operator: "all",
  match_description: "netflix",
  match_counterparty: "Netflix International",
  match_type: null,
  category_id: "entertainment",
};

describe("Rule Engine V2", () => {
  it("starts with the complete description and an opt-in counterparty", () => {
    expect(suggestRuleFromRow(row)).toEqual({
      kind: "contains",
      match_operator: "all",
      match_description: row.description,
      match_counterparty: null,
      match_type: null,
    });
    expect(suggestCounterpartyRule(row)).toBe(row.counterparty);
  });
  it("preserves store numbers, dates, locations and identifiers in suggestions", () => {
    expect(
      suggestDescriptionRule({
        description: "  PŁATNOŚĆ KARTĄ\u00a0 BIEDRONKA 0123 RUMIA 04.10.2026  ",
      })
    ).toBe("PŁATNOŚĆ KARTĄ BIEDRONKA 0123 RUMIA 04.10.2026");
  });
  it("keeps raw text separate from Unicode-normalized display and matching text", () => {
    const raw = "  Cafe\u0301\u00a0  0123\nWARSZAWA ";
    expect(normalizeTransactionText(raw)).toEqual({
      raw,
      display: "Café 0123 WARSZAWA",
      normalized: "café 0123 warszawa",
    });
  });
  it("does not invent a counterparty or substitute it for a blank description", () => {
    expect(suggestCounterpartyRule({ description: "NETFLIX" } as typeof row)).toBe("");
    expect(suggestRuleFromRow({ ...row, description: "  " })).toBeNull();
  });
  it.each(["contains", "exact"] as const)("%s: ALL requires both independent fields", (kind) => {
    const rule = { ...base, kind, match_description: row.description };
    expect(matchRule(rule, row)).toBe(true);
    expect(matchRule(rule, { ...row, counterparty: "Other merchant" })).toBe(false);
    expect(matchRule(rule, { ...row, description: "Other transaction" })).toBe(false);
    expect(matchRule(rule, { ...row, counterparty: null })).toBe(false);
  });
  it.each(["any", undefined] as const)(
    "preserves legacy operator %s, including identical generated values",
    (match_operator) => {
      const rule = { ...base, match_operator, match_counterparty: "netflix" };
      expect(matchRule(rule, { ...row, description: "Payment" })).toBe(true);
      expect(matchRule(rule, { ...row, counterparty: null })).toBe(true);
    }
  );
  it("description-only works without a counterparty", () => {
    expect(matchRule({ ...base, match_counterparty: null }, { ...row, counterparty: null })).toBe(
      true
    );
  });
  it("counterparty-only does not search the description", () => {
    expect(matchRule({ ...base, match_description: null }, { ...row, counterparty: null })).toBe(
      false
    );
  });
  it("compares case and repeated whitespace consistently", () => {
    expect(
      matchRule(
        {
          ...base,
          match_description: "NETFLIX.com\u00a0 AMSTERDAM",
          match_counterparty: "NETFLIX   INTERNATIONAL",
        },
        row
      )
    ).toBe(true);
  });
  it("adding a condition never broadens ALL matches", () => {
    const rows = [row, { ...row, counterparty: "Other" }, { ...row, description: "Other" }];
    const descriptionMatches = rows.filter((r) =>
      matchRule({ ...base, match_counterparty: null }, r)
    );
    const allMatches = rows.filter((r) => matchRule(base, r));
    expect(descriptionMatches).toHaveLength(2);
    expect(allMatches).toEqual([row]);
  });
  it("type and day conditions still narrow legacy OR", () => {
    const rule = {
      ...base,
      kind: "composite" as const,
      match_operator: "any" as const,
      match_type: "expense" as const,
      match_day_of_month: 4,
    };
    expect(matchRule(rule, row)).toBe(true);
    expect(matchRule(rule, { ...row, type: "income" })).toBe(false);
    expect(matchRule(rule, { ...row, posted_at: "2026-10-05" })).toBe(false);
  });
  it("never matches an empty enabled condition under ALL", () => {
    expect(matchRule({ ...base, match_counterparty: "   " }, row)).toBe(false);
    expect(matchRule({ ...base, match_description: null, match_counterparty: null }, row)).toBe(
      false
    );
  });
  it("distinguishes ALL from ANY only when two text conditions exist", () => {
    expect(findDuplicateCategorizationRule([base], { ...base, match_operator: "any" })).toBeNull();
    expect(
      findDuplicateCategorizationRule([{ ...base, match_counterparty: null }], {
        ...base,
        match_operator: "any",
        match_counterparty: null,
      })
    ).not.toBeNull();
  });
});
