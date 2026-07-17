import { describe, expect, it } from "vitest";
import { RECURRENCE_DATE_FIXTURES } from "../fixtures/recurrence-date-fixtures";
import { createAdminClient } from "./setup";

type RpcDates = string[] | null;

async function fetchOccurrenceDates(
  fixture: (typeof RECURRENCE_DATE_FIXTURES)[number]
): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("recurring_occurrence_dates", {
    p_anchor_date: fixture.params.anchorDate,
    p_frequency: fixture.params.frequency,
    p_interval: fixture.params.interval ?? 1,
    p_weekday: fixture.params.weekday ?? null,
    p_month: fixture.params.month ?? null,
    p_day: fixture.params.day ?? null,
    p_after_exclusive: fixture.afterExclusive,
    p_before_exclusive: fixture.beforeExclusive,
    p_end_date_inclusive: fixture.params.endDate ?? null,
    p_max_count: 400,
  });
  if (error) throw error;
  return ((data as RpcDates) ?? []).map((d) => d.slice(0, 10));
}

describe("SQL recurring_occurrence_dates — shared fixtures", () => {
  for (const fixture of RECURRENCE_DATE_FIXTURES) {
    it(fixture.name, async () => {
      expect(await fetchOccurrenceDates(fixture)).toEqual(fixture.expected);
    });
  }
});

describe("SQL recurring_occurrence_on_date", () => {
  it("matches list primitive for due-day checks", async () => {
    const admin = createAdminClient();
    const params = {
      p_anchor_date: "2026-01-10",
      p_frequency: "monthly",
      p_interval: 1,
      p_weekday: null,
      p_month: null,
      p_day: 10,
      p_end_date_inclusive: null,
    };

    const { data: due, error: dueError } = await admin.rpc("recurring_occurrence_on_date", {
      ...params,
      p_reference_date: "2026-07-10",
    });
    if (dueError) throw dueError;
    expect(due).toBe(true);

    const { data: notDue, error: notDueError } = await admin.rpc("recurring_occurrence_on_date", {
      ...params,
      p_reference_date: "2026-07-11",
    });
    if (notDueError) throw notDueError;
    expect(notDue).toBe(false);
  });
});
