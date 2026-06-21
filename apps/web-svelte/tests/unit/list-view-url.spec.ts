import { describe, expect, it } from "vitest";
import {
  buildListViewUrl,
  parseDashboardPeriod,
  parseScopeFilter,
  writeDashboardPeriod,
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
});

describe("write helpers", () => {
  it("omits default values from query", () => {
    const params = new URLSearchParams("group=all&period=month");
    writeScopeFilter(params, "own");
    writeDashboardPeriod(params, "week");
    expect(params.toString()).toBe("");
  });
});

describe("buildListViewUrl", () => {
  it("builds dashboard url with scope and period", () => {
    expect(
      buildListViewUrl("/dashboard", new URLSearchParams(), { group: "all", period: "month" })
    ).toBe("/dashboard?group=all&period=month");
  });
});
