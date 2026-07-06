import { describe, expect, it } from "vitest";
import {
  buildListViewUrl,
  parseDashboardPeriod,
  parseDashboardRange,
  parseScopeFilter,
  writeDashboardPeriod,
  writeDashboardRange,
  writeScopeFilter,
} from "$lib/utils/list-view-url";

describe("parseScopeFilter", () => {
  it("defaults to own", () => {
    expect(parseScopeFilter(new URLSearchParams())).toBe("own");
  });

  it("parses all and group id", () => {
    expect(parseScopeFilter(new URLSearchParams("group=all"))).toBe("all");
    expect(parseScopeFilter(new URLSearchParams("group=g1"))).toBe("g1");
  });
});

describe("parseDashboardPeriod", () => {
  it("defaults to week", () => {
    expect(parseDashboardPeriod(new URLSearchParams())).toBe("week");
  });

  it("parses month and year", () => {
    expect(parseDashboardPeriod(new URLSearchParams("period=month"))).toBe("month");
    expect(parseDashboardPeriod(new URLSearchParams("period=year"))).toBe("year");
  });

  it("an explicit date range wins over the period chip", () => {
    const params = new URLSearchParams("period=month&startDate=2026-05-01&endDate=2026-05-31");
    expect(parseDashboardPeriod(params)).toBe("custom");
  });
});

describe("parseDashboardRange", () => {
  it("returns null without a complete valid range", () => {
    expect(parseDashboardRange(new URLSearchParams())).toBeNull();
    expect(parseDashboardRange(new URLSearchParams("startDate=2026-05-01"))).toBeNull();
    expect(
      parseDashboardRange(new URLSearchParams("startDate=nope&endDate=2026-05-31"))
    ).toBeNull();
  });

  it("parses and normalizes a reversed range", () => {
    expect(
      parseDashboardRange(new URLSearchParams("startDate=2026-05-31&endDate=2026-05-01"))
    ).toEqual({ start: "2026-05-01", end: "2026-05-31" });
  });
});

describe("write helpers", () => {
  it("omits default values from query", () => {
    const params = new URLSearchParams("group=all&period=month");
    writeScopeFilter(params, "own");
    writeDashboardPeriod(params, "week");
    expect(params.toString()).toBe("");
  });

  it("selecting a period chip clears a custom range", () => {
    const params = new URLSearchParams("startDate=2026-05-01&endDate=2026-05-31");
    writeDashboardPeriod(params, "month");
    expect(params.toString()).toBe("period=month");
  });

  it("writing a range clears the period chip", () => {
    const params = new URLSearchParams("period=year");
    writeDashboardRange(params, { start: "2026-05-01", end: "2026-05-31" });
    expect(params.get("period")).toBeNull();
    expect(params.get("startDate")).toBe("2026-05-01");
    expect(params.get("endDate")).toBe("2026-05-31");
  });
});

describe("buildListViewUrl", () => {
  it("builds dashboard url with scope and period", () => {
    expect(
      buildListViewUrl("/dashboard", new URLSearchParams(), { group: "all", period: "month" })
    ).toBe("/dashboard?group=all&period=month");
  });

  it("range patch wins over period patch", () => {
    expect(
      buildListViewUrl("/dashboard", new URLSearchParams("period=month"), {
        range: { start: "2026-05-01", end: "2026-05-31" },
      })
    ).toBe("/dashboard?startDate=2026-05-01&endDate=2026-05-31");
  });
});
