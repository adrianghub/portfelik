import { describe, expect, it } from "vitest";
import {
  buildListViewUrl,
  parseDashboardPeriod,
  parseScopeFilter,
  writeDashboardPeriod,
  writeScopeFilter,
} from "$lib/utils/list-view-url";

describe("parseScopeFilter", () => {
  it("defaults to all", () => {
    expect(parseScopeFilter(new URLSearchParams())).toBe("all");
  });

  it("parses own and group id", () => {
    expect(parseScopeFilter(new URLSearchParams("group=own"))).toBe("own");
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
});

describe("write helpers", () => {
  it("omits default values from query", () => {
    const params = new URLSearchParams("group=own&period=month");
    writeScopeFilter(params, "all");
    writeDashboardPeriod(params, "week");
    expect(params.toString()).toBe("");
  });
});

describe("buildListViewUrl", () => {
  it("builds dashboard url with scope and period", () => {
    expect(
      buildListViewUrl("/dashboard", new URLSearchParams(), { group: "own", period: "month" })
    ).toBe("/dashboard?group=own&period=month");
  });
});
