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
const gradle = readFileSync(
  resolve(root, "apps/web-svelte/android/app/build.gradle"),
  "utf8"
);
const versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
const versionCode = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);

const semver = /^\d+\.\d+\.\d+$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const problems = [];

if (!Array.isArray(versions) || versions.length === 0) problems.push("changelog is empty");
if (!versionName || !Number.isInteger(versionCode)) {
  problems.push("android/app/build.gradle is missing versionName or versionCode");
}

const seen = new Set();
for (const [index, entry] of versions.entries()) {
  if (!semver.test(entry.version ?? "")) problems.push(`${entry.version} is not a version name`);
  if (!Number.isInteger(entry.versionCode) || entry.versionCode < 1) {
    problems.push(`${entry.version} has no Play version code`);
  }
  if (!isoDate.test(entry.date ?? "")) problems.push(`${entry.version} date is not YYYY-MM-DD`);
  if (seen.has(entry.version)) problems.push(`${entry.version} is duplicated`);
  seen.add(entry.version);
  if (!Array.isArray(entry.items) || entry.items.length === 0) {
    problems.push(`${entry.version} has no notes`);
  }
  if (index > 0) {
    const value = (version) => {
      const [major, minor, patch] = version.split(".").map(Number);
      return major * 1_000_000 + minor * 1_000 + patch;
    };
    if (value(entry.version) >= value(versions[index - 1].version)) {
      problems.push(`${entry.version} is not older than ${versions[index - 1].version}`);
    }
    if (entry.versionCode >= versions[index - 1].versionCode) {
      problems.push(`${entry.version} code ${entry.versionCode} is not older`);
    }
  }
}

const current = versions[0];
if (current && current.version !== packageVersion) {
  problems.push(`package.json ${packageVersion} does not match changelog ${current.version}`);
}
if (current && current.version !== versionName) {
  problems.push(`AAB versionName ${versionName} does not match changelog ${current.version}`);
}
if (current && current.versionCode !== versionCode) {
  problems.push(`AAB versionCode ${versionCode} does not match changelog ${current?.versionCode}`);
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

console.log(`release ${versionName} (${versionCode}) matches the Play bundle and the changelog`);
