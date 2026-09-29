import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appVersion,
  changelog,
  changelogProblems,
  changelogReturnHref,
  formatChangelogDate,
  readPlayVersion,
  releaseNotesMarkdown,
} from "$lib/content/changelog";

const packageVersion = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
).version as string;
const play = readPlayVersion(
  readFileSync(new URL("../../android/app/build.gradle", import.meta.url), "utf8")
);

describe("changelog", () => {
  it("matches the Play bundle and package.json", () => {
    expect(changelogProblems(changelog, { packageVersion, play })).toEqual([]);
    expect(appVersion).toBe("1.3.0");
    expect(play).toEqual({ versionName: "1.3.0", versionCode: 7 });
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

  it("renders release notes with the Play version code", () => {
    const notes = releaseNotesMarkdown(changelog[0]);
    expect(notes).toContain("# 1.3.0");
    expect(notes).toContain("Kod wersji 7.");
    expect(notes).toContain("- Kokpit wita Hej");
  });
});
