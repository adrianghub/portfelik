import { describe, expect, it } from "vitest";
import {
  analysisReturnFromSearchParams,
  parseAnalysisReturn,
  withAnalysisReturn,
} from "$lib/navigation/analysis-return";

describe("analysis return navigation", () => {
  it("embeds a safe returnTo on drill URLs", () => {
    const href = withAnalysisReturn(
      "/transactions?start=2026-10-01&end=2026-10-31",
      "/analysis?mode=forecast&horizon=3months"
    );
    expect(href).toContain("returnTo=");
    expect(decodeURIComponent(new URL(href, "https://x").searchParams.get("returnTo")!)).toBe(
      "/analysis?mode=forecast&horizon=3months"
    );
  });

  it("rejects external or protocol-relative return paths", () => {
    expect(parseAnalysisReturn("https://evil.example/analysis")).toBeNull();
    expect(parseAnalysisReturn("//evil.example")).toBeNull();
    expect(parseAnalysisReturn("/transactions")).toBeNull();
    expect(parseAnalysisReturn("/analysis?mode=history")).toBe("/analysis?mode=history");
  });

  it("reads returnTo from search params", () => {
    const params = new URLSearchParams();
    params.set("returnTo", "/analysis?span=month");
    expect(analysisReturnFromSearchParams(params)).toBe("/analysis?span=month");
  });

  it("preserves forecast day in the return path", () => {
    const href = withAnalysisReturn(
      "/transactions?status=upcoming,overdue",
      "/analysis?mode=forecast&horizon=3months&day=2026-11-15&month=2026-11"
    );
    expect(decodeURIComponent(new URL(href, "https://x").searchParams.get("returnTo")!)).toBe(
      "/analysis?mode=forecast&horizon=3months&day=2026-11-15&month=2026-11"
    );
  });
});
