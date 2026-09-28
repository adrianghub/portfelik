import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appVersion,
  changelog,
  changelogProblems,
  changelogReturnHref,
  formatChangelogDate,
  releaseNotesMarkdown,
} from "$lib/content/changelog";

const packageVersion = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
).version as string;

describe("changelog", () => {
  it("matches package.json and stays ordered", () => {
    expect(changelogProblems(changelog, packageVersion)).toEqual([]);
    expect(appVersion).toBe(packageVersion);
  });

  it("formats the release date in Polish", () => {
    expect(formatChangelogDate("2026-09-28")).toBe("28 września 2026");
  });

  it("returns only to known in-app paths", () => {
    expect(changelogReturnHref("/login")).toBe("/login");
    expect(changelogReturnHref("/dashboard")).toBe("/dashboard");
    expect(changelogReturnHref("/plans?x=1")).toBe("/plans");
    expect(changelogReturnHref("https://evil.example")).toBe("/login");
    expect(changelogReturnHref("//evil.example")).toBe("/login");
    expect(changelogReturnHref(null)).toBe("/login");
  });

  it("renders release notes for the current version", () => {
    const notes = releaseNotesMarkdown(changelog[0]);
    expect(notes).toContain(`# v${packageVersion}`);
    expect(notes).toContain("## Ekran");
    expect(notes).toContain("- Kokpit otwiera się na wyniku miesiąca");
  });
});
