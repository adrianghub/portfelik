import notes from "$lib/content/changelog.json";

export interface ChangelogVersion {
  version: string;
  versionCode: number;
  date: string;
  items: string[];
}

export interface PlayVersion {
  versionName: string;
  versionCode: number;
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

export function readPlayVersion(gradle: string): PlayVersion {
  const name = gradle.match(/versionName\s+"([^"]+)"/);
  const code = gradle.match(/versionCode\s+(\d+)/);
  if (!name || !code)
    throw new Error("android/app/build.gradle is missing versionName or versionCode");
  return { versionName: name[1], versionCode: Number(code[1]) };
}

export function changelogProblems(
  versions: ChangelogVersion[],
  release: { packageVersion: string; play: PlayVersion }
): string[] {
  const problems: string[] = [];
  if (versions.length === 0) problems.push("changelog is empty");
  const seen = new Set<string>();
  versions.forEach((entry, index) => {
    if (!SEMVER.test(entry.version)) problems.push(`${entry.version} is not a version name`);
    if (!Number.isInteger(entry.versionCode) || entry.versionCode < 1) {
      problems.push(`${entry.version} has no Play version code`);
    }
    if (!ISO_DATE.test(entry.date)) problems.push(`${entry.version} date is not YYYY-MM-DD`);
    if (seen.has(entry.version)) problems.push(`${entry.version} is duplicated`);
    seen.add(entry.version);
    if (entry.items.length === 0) problems.push(`${entry.version} has no notes`);
    if (index > 0) {
      if (semverValue(entry.version) >= semverValue(versions[index - 1].version)) {
        problems.push(`${entry.version} is not older than ${versions[index - 1].version}`);
      }
      if (entry.versionCode >= versions[index - 1].versionCode) {
        problems.push(`${entry.version} code ${entry.versionCode} is not older`);
      }
    }
  });
  const current = versions[0];
  if (!current) return problems;
  if (current.version !== release.packageVersion) {
    problems.push(
      `package.json ${release.packageVersion} does not match changelog ${current.version}`
    );
  }
  if (current.version !== release.play.versionName) {
    problems.push(
      `AAB versionName ${release.play.versionName} does not match changelog ${current.version}`
    );
  }
  if (current.versionCode !== release.play.versionCode) {
    problems.push(
      `AAB versionCode ${release.play.versionCode} does not match changelog ${current.versionCode}`
    );
  }
  return problems;
}

export function releaseNotesMarkdown(entry: ChangelogVersion): string {
  const lines = [
    `# ${entry.version}`,
    "",
    formatChangelogDate(entry.date),
    "",
    `Kod wersji ${entry.versionCode}.`,
    "",
  ];
  for (const item of entry.items) lines.push(`- ${item}`);
  lines.push("");
  return lines.join("\n");
}

function semverValue(version: string): number {
  const [major, minor, patch] = version.split(".").map(Number);
  return major * 1_000_000 + minor * 1_000 + patch;
}
