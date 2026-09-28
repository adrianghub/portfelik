import notes from "$lib/content/changelog.json";

export interface ChangelogSection {
  title: string;
  items: string[];
}

export interface ChangelogVersion {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

const SEMVER = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const RETURN_PATHS = new Set([
  "/login",
  "/dashboard",
  "/transactions",
  "/plans",
  "/settings",
  "/import",
  "/privacy",
]);

export const changelog: ChangelogVersion[] = notes.versions;

export const appVersion = changelog[0]?.version ?? "0.0.0";

export function formatChangelogDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

/** Close target for /changelog?from=. Unknown values stay on the login page. */
export function changelogReturnHref(from: string | null): string {
  if (!from || !from.startsWith("/") || from.startsWith("//") || from.includes("\\")) {
    return "/login";
  }
  const path = from.split(/[?#]/, 1)[0];
  return RETURN_PATHS.has(path) ? path : "/login";
}

export function changelogProblems(versions: ChangelogVersion[], packageVersion: string): string[] {
  const problems: string[] = [];
  if (versions.length === 0) problems.push("changelog is empty");
  const seen = new Set<string>();
  versions.forEach((entry, index) => {
    if (!SEMVER.test(entry.version)) problems.push(`${entry.version} is not semver`);
    if (!ISO_DATE.test(entry.date)) problems.push(`${entry.version} date is not YYYY-MM-DD`);
    if (seen.has(entry.version)) problems.push(`${entry.version} is duplicated`);
    seen.add(entry.version);
    if (entry.sections.length === 0) problems.push(`${entry.version} has no sections`);
    for (const section of entry.sections) {
      if (!section.title.trim()) problems.push(`${entry.version} has an empty section title`);
      if (section.items.length === 0)
        problems.push(`${entry.version} / ${section.title} has no items`);
    }
    if (index > 0 && semverValue(entry.version) >= semverValue(versions[index - 1].version)) {
      problems.push(`${entry.version} is not older than ${versions[index - 1].version}`);
    }
  });
  if (versions[0] && versions[0].version !== packageVersion) {
    problems.push(`package.json ${packageVersion} does not match changelog ${versions[0].version}`);
  }
  return problems;
}

export function releaseNotesMarkdown(entry: ChangelogVersion): string {
  const lines = [`# v${entry.version}`, "", formatChangelogDate(entry.date), ""];
  for (const section of entry.sections) {
    lines.push(`## ${section.title}`, "");
    for (const item of section.items) lines.push(`- ${item}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

function semverValue(version: string): number {
  const [major, minor, patch] = version.split(".").map(Number);
  return major * 1_000_000 + minor * 1_000 + patch;
}
