import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert, getUser, from } = vi.hoisted(() => ({
  upsert: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock("$lib/supabase", () => ({
  supabase: {
    auth: { getUser },
    from,
  },
}));

import { rememberRecurringOccurrenceSkip } from "$lib/services/recurring-occurrences";

function occurrence(overrides: Record<string, unknown> = {}) {
  return {
    id: "occurrence-id",
    user_id: "user-id",
    group_id: null,
    recurring_template_id: "template-id",
    recurring_occurrence_date: "2026-07-10",
    projected: false,
    ...overrides,
  } as never;
}

describe("rememberRecurringOccurrenceSkip", () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: { id: "actor-id" } } });
    upsert.mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });
  });

  it("stores a null skipped transaction id for a projected occurrence", async () => {
    await rememberRecurringOccurrenceSkip(
      occurrence({ id: "projected:template-id:2026-07-10", projected: true })
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ skipped_transaction_id: null }),
      expect.anything()
    );
  });

  it("keeps the real id for a materialized occurrence", async () => {
    await rememberRecurringOccurrenceSkip(occurrence());

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ skipped_transaction_id: "occurrence-id" }),
      expect.anything()
    );
  });
});
