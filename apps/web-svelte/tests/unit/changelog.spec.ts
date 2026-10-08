import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  appVersion,
  changelog,
  changelogProblems,
  changelogReturnHref,
  formatChangelogDate,
  isChangelogUnseen,
  releaseNotesMarkdown,
} from "$lib/content/changelog";

const packageVersion = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
).version as string;
const play = { versionName: changelog[0].version, versionCode: changelog[0].versionCode };

describe("isChangelogUnseen", () => {
  it("is unseen until the current version has been opened", () => {
    expect(isChangelogUnseen(undefined, "1.3.8")).toBe(true);
    expect(isChangelogUnseen(null, "1.3.8")).toBe(true);
    expect(isChangelogUnseen("1.3.7", "1.3.8")).toBe(true);
    expect(isChangelogUnseen("1.3.8", "1.3.8")).toBe(false);
    expect(isChangelogUnseen("1.4.0", "1.3.8")).toBe(false);
  });
});

describe("changelog", () => {
  it("matches the Play bundle and package.json", () => {
    expect(changelogProblems(changelog, { packageVersion, play })).toEqual([]);
    expect(appVersion).toBe(packageVersion);
  });

  it("formats the release date in Polish", () => {
    expect(formatChangelogDate("2026-09-30")).toBe("30 września 2026");
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
    expect(notes).toContain(`# ${appVersion}`);
    expect(notes).toContain(`Kod wersji ${play.versionCode}.`);
    expect(notes).toContain(`- ${changelog[0].items[0]}`);
  });
});
