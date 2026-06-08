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
  it("defaults to month", () => {
    expect(parseDashboardPeriod(new URLSearchParams())).toBe("month");
  });

  it("parses week and year", () => {
    expect(parseDashboardPeriod(new URLSearchParams("period=week"))).toBe("week");
    expect(parseDashboardPeriod(new URLSearchParams("period=year"))).toBe("year");
  });
});

describe("write helpers", () => {
  it("omits default values from query", () => {
    const params = new URLSearchParams("group=own&period=week");
    writeScopeFilter(params, "all");
    writeDashboardPeriod(params, "month");
    expect(params.toString()).toBe("");
  });
});

describe("buildListViewUrl", () => {
  it("builds dashboard url with scope and period", () => {
    expect(buildListViewUrl("/dashboard", new URLSearchParams(), { group: "own", period: "week" })).toBe(
      "/dashboard?group=own&period=week"
    );
  });
});
