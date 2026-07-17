import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, single, eq } = vi.hoisted(() => ({
  rpc: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("$lib/supabase", () => {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (...args: unknown[]) => {
    eq(...args);
    return builder;
  };
  builder.single = single;
  return { supabase: { rpc, from: () => builder } };
});

import { dayAfter, dayBefore, materializeOccurrence } from "$lib/services/recurring-series";
import type { TransactionWithCategory } from "$lib/types";

describe("dayBefore", () => {
  it("returns the previous UTC day", () => {
    expect(dayBefore("2026-07-15")).toBe("2026-07-14");
  });
  it("crosses month boundaries", () => {
    expect(dayBefore("2026-08-01")).toBe("2026-07-31");
  });
  it("crosses year boundaries", () => {
    expect(dayBefore("2026-01-01")).toBe("2025-12-31");
  });
  it("returns the next UTC day", () => {
    expect(dayAfter("2026-07-31")).toBe("2026-08-01");
  });
});

function template(over: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return {
    id: "tmpl-1",
    amount: 200,
    currency: "PLN",
    counterparty: null,
    description: "Najem",
    date: "2026-01-05",
    type: "expense",
    status: "paid",
    category_id: "cat-1",
    user_id: "owner-id",
    is_recurring: true,
    recurring_day: 5,
    recurrence_frequency: "monthly",
    recurrence_interval: 1,
    recurrence_weekday: null,
    recurrence_month: null,
    recurring_template_id: null,
    recurring_occurrence_date: null,
    recurrence_end_date: null,
    group_id: "group-1",
    created_at: "",
    updated_at: "",
    category_name: "Mieszkanie",
    category_type: "expense",
    is_hold: false,
    ...over,
  };
}

describe("materializeOccurrence", () => {
  beforeEach(() => {
    rpc.mockResolvedValue({ data: "new-row", error: null });
    single.mockResolvedValue({ data: { id: "new-row", description: "Najem" }, error: null });
    eq.mockClear();
    rpc.mockClear();
  });

  it("materializes via RPC and re-fetches the row", async () => {
    const row = await materializeOccurrence({
      template: template({ user_id: "owner-id", group_id: "group-1" }),
      occurrenceDate: "2026-08-05",
    });

    expect(rpc).toHaveBeenCalledWith("materialize_recurring_occurrence", {
      p_template_id: "tmpl-1",
      p_occurrence_date: "2026-08-05",
    });
    expect(row.id).toBe("new-row");
  });
});

import {
  isActiveRecurringSeries,
  summarizeRecurringSeries,
  buildRecurringSeriesList,
} from "$lib/services/recurring-series";

function tmpl(over: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return {
    id: "t1",
    amount: 200,
    currency: "PLN",
    counterparty: "Najem",
    description: "Czynsz",
    date: "2026-01-10",
    type: "expense",
    status: "paid",
    category_id: "c1",
    user_id: "u1",
    is_recurring: true,
    recurring_day: 10,
    recurrence_frequency: "monthly",
    recurrence_interval: 1,
    recurrence_weekday: null,
    recurrence_month: null,
    recurring_template_id: null,
    recurring_occurrence_date: null,
    recurrence_end_date: null,
    group_id: null,
    created_at: "",
    updated_at: "",
    category_name: "Mieszkanie",
    category_type: "expense",
    is_hold: false,
    ...over,
  };
}

const NOW = new Date("2026-06-26T00:00:00.000Z");

describe("isActiveRecurringSeries", () => {
  it("is active when open-ended", () => {
    expect(isActiveRecurringSeries(tmpl(), "2026-06-26")).toBe(true);
  });
  it("is active when end date is today or later", () => {
    expect(isActiveRecurringSeries(tmpl({ recurrence_end_date: "2026-06-26" }), "2026-06-26")).toBe(
      true
    );
  });
  it("is inactive once the end date has passed", () => {
    expect(isActiveRecurringSeries(tmpl({ recurrence_end_date: "2026-06-25" }), "2026-06-26")).toBe(
      false
    );
  });
  it("is inactive without a frequency", () => {
    expect(isActiveRecurringSeries(tmpl({ recurrence_frequency: null }), "2026-06-26")).toBe(false);
  });
});

describe("summarizeRecurringSeries", () => {
  it("derives title, cadence, range, scope and the next occurrence >= today", () => {
    const s = summarizeRecurringSeries(tmpl(), NOW);
    expect(s.title).toBe("Najem");
    expect(s.amount).toBe(200);
    expect(s.categoryName).toBe("Mieszkanie");
    expect(s.groupId).toBeNull();
    expect(s.startDate).toBe("2026-01-10");
    expect(s.endDate).toBeNull();
    expect(s.cadence.length).toBeGreaterThan(0);
    expect(s.nextDate).toBe("2026-07-10");
  });
  it("falls back to description when counterparty is empty", () => {
    expect(summarizeRecurringSeries(tmpl({ counterparty: null }), NOW).title).toBe("Czynsz");
  });
  it("returns null nextDate when the series ends before the next occurrence", () => {
    const s = summarizeRecurringSeries(tmpl({ recurrence_end_date: "2026-07-01" }), NOW);
    expect(s.nextDate).toBeNull();
  });
});

describe("buildRecurringSeriesList", () => {
  it("keeps active series, drops ended, sorts by nextDate asc (nulls last)", () => {
    const list = buildRecurringSeriesList(
      [
        tmpl({ id: "later", recurring_day: 20 }),
        tmpl({ id: "ended", recurrence_end_date: "2026-01-01" }),
        tmpl({ id: "sooner", recurring_day: 5, date: "2026-01-05" }),
      ],
      NOW
    );
    expect(list.map((s) => s.id)).toEqual(["sooner", "later"]);
  });
});
