import type { RecurrenceDateParams } from "$lib/services/recurrence-dates";

export interface RecurrenceDateFixture {
  name: string;
  params: RecurrenceDateParams;
  afterExclusive: string;
  beforeExclusive: string;
  expected: string[];
}

/** Shared fixtures for SQL + client recurrence parity. */
export const RECURRENCE_DATE_FIXTURES: RecurrenceDateFixture[] = [
  {
    name: "monthly on recurring_day",
    params: {
      anchorDate: "2026-01-10",
      frequency: "monthly",
      interval: 1,
      day: 10,
    },
    afterExclusive: "2026-06-23",
    beforeExclusive: "2026-09-23",
    expected: ["2026-07-10", "2026-08-10", "2026-09-10"],
  },
  {
    name: "monthly every 2 months (anchor phase)",
    params: {
      anchorDate: "2026-01-10",
      frequency: "monthly",
      interval: 2,
      day: 10,
    },
    afterExclusive: "2026-06-23",
    beforeExclusive: "2026-12-23",
    expected: ["2026-07-10", "2026-09-10", "2026-11-10"],
  },
  {
    name: "monthly clamps day 31 in short months",
    params: {
      anchorDate: "2026-01-31",
      frequency: "monthly",
      interval: 1,
      day: 31,
    },
    afterExclusive: "2026-01-31",
    beforeExclusive: "2026-04-15",
    expected: ["2026-02-28", "2026-03-31"],
  },
  {
    name: "weekly on Monday",
    params: {
      anchorDate: "2026-06-01",
      frequency: "weekly",
      interval: 1,
      weekday: 1,
    },
    afterExclusive: "2026-06-23",
    beforeExclusive: "2026-07-14",
    expected: ["2026-06-29", "2026-07-06", "2026-07-13"],
  },
  {
    name: "yearly on Mar 15",
    params: {
      anchorDate: "2026-03-15",
      frequency: "yearly",
      interval: 1,
      month: 3,
      day: 15,
    },
    afterExclusive: "2026-06-23",
    beforeExclusive: "2029-06-23",
    expected: ["2027-03-15", "2028-03-15", "2029-03-15"],
  },
  {
    name: "daily stale anchor fast-forward",
    params: {
      anchorDate: "2024-01-01",
      frequency: "daily",
      interval: 1,
    },
    afterExclusive: "2026-06-19",
    beforeExclusive: "2026-06-25",
    expected: ["2026-06-20", "2026-06-21", "2026-06-22", "2026-06-23", "2026-06-24"],
  },
  {
    name: "exclusive bounds trim edges",
    params: {
      anchorDate: "2026-01-10",
      frequency: "monthly",
      interval: 1,
      day: 10,
    },
    afterExclusive: "2026-07-10",
    beforeExclusive: "2026-09-10",
    expected: ["2026-08-10"],
  },
  {
    name: "end date stops future occurrences",
    params: {
      anchorDate: "2026-01-10",
      frequency: "monthly",
      interval: 1,
      day: 10,
      endDate: "2026-07-31",
    },
    afterExclusive: "2026-06-23",
    beforeExclusive: "2026-09-23",
    expected: ["2026-07-10"],
  },
  {
    name: "never emits before anchor date",
    params: {
      anchorDate: "2026-07-15",
      frequency: "monthly",
      interval: 1,
      day: 15,
    },
    afterExclusive: "2026-06-01",
    beforeExclusive: "2026-08-01",
    expected: ["2026-07-15"],
  },
  {
    name: "yearly Feb 29 clamps in non-leap years",
    params: {
      anchorDate: "2024-02-29",
      frequency: "yearly",
      interval: 1,
      month: 2,
      day: 29,
    },
    afterExclusive: "2024-12-31",
    beforeExclusive: "2028-03-01",
    expected: ["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"],
  },
  {
    name: "weekly stale anchor fast-forward",
    params: {
      anchorDate: "2023-01-02",
      frequency: "weekly",
      interval: 1,
      weekday: 1,
    },
    afterExclusive: "2026-06-19",
    beforeExclusive: "2026-07-07",
    expected: ["2026-06-22", "2026-06-29", "2026-07-06"],
  },
];
