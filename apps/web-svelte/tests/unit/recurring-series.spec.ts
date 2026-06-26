import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, upsert, single } = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsert: vi.fn(),
  single: vi.fn(),
}));

vi.mock("$lib/supabase", () => {
  const builder: Record<string, unknown> = {};
  builder.upsert = (payload: unknown, opts: unknown) => {
    upsert(payload, opts);
    return builder;
  };
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.single = single;
  return { supabase: { auth: { getUser }, from: () => builder } };
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
    getUser.mockResolvedValue({ data: { user: { id: "actor-id" } } });
    single
      .mockReset()
      .mockResolvedValueOnce({ data: { id: "new-row" }, error: null })
      .mockResolvedValueOnce({ data: { id: "new-row" }, error: null });
    upsert.mockClear();
  });

  it("inserts the materialized row owned by the acting user, not the template owner", async () => {
    // A co-owner materializes an occurrence of another member's shared template.
    await materializeOccurrence({
      template: template({ user_id: "owner-id", group_id: "group-1" }),
      occurrenceDate: "2026-08-05",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "actor-id",
        group_id: "group-1",
        recurring_template_id: "tmpl-1",
        recurring_occurrence_date: "2026-08-05",
      }),
      expect.anything()
    );
  });
});
