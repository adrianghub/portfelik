import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageVersion = JSON.parse(
  readFileSync(resolve(root, "apps/web-svelte/package.json"), "utf8")
).version;
const versions = JSON.parse(
  readFileSync(resolve(root, "apps/web-svelte/src/lib/content/changelog.json"), "utf8")
).versions;

const semver = /^\d+\.\d+\.\d+$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const problems = [];

if (!Array.isArray(versions) || versions.length === 0) problems.push("changelog is empty");

const seen = new Set();
for (const [index, entry] of versions.entries()) {
  if (!semver.test(entry.version ?? "")) problems.push(`${entry.version} is not semver`);
  if (!isoDate.test(entry.date ?? "")) problems.push(`${entry.version} date is not YYYY-MM-DD`);
  if (seen.has(entry.version)) problems.push(`${entry.version} is duplicated`);
  seen.add(entry.version);
  if (!Array.isArray(entry.sections) || entry.sections.length === 0) {
    problems.push(`${entry.version} has no sections`);
  }
  for (const section of entry.sections ?? []) {
    if (!String(section.title ?? "").trim()) problems.push(`${entry.version} has an empty section`);
    if (!Array.isArray(section.items) || section.items.length === 0) {
      problems.push(`${entry.version} / ${section.title} has no items`);
    }
  }
  if (index > 0) {
    const value = (version) => {
      const [major, minor, patch] = version.split(".").map(Number);
      return major * 1_000_000 + minor * 1_000 + patch;
    };
    if (value(entry.version) >= value(versions[index - 1].version)) {
      problems.push(`${entry.version} is not older than ${versions[index - 1].version}`);
    }
  }
}

if (versions[0]?.version !== packageVersion) {
  problems.push(
    `package.json ${packageVersion} does not match changelog ${versions[0]?.version ?? "missing"}`
  );
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

console.log(`release version v${packageVersion} matches the changelog`);
