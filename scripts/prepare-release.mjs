import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function nextRelease(
  versions,
  items,
  date = new Date().toISOString().slice(0, 10),
) {
  if (!versions.length || !items.length || items.some((item) => !item.trim())) {
    throw new Error("Provide at least one short release note.");
  }
  const [major, minor, patch] = versions[0].version.split(".").map(Number);
  if (
    !/^\d+\.\d+\.\d+$/.test(versions[0].version) ||
    !Number.isSafeInteger(patch + 1)
  ) {
    throw new Error("Invalid existing release version.");
  }
  const versionCode =
    Math.max(...versions.map((entry) => entry.versionCode)) + 1;
  if (!Number.isSafeInteger(versionCode) || versionCode > 2_100_000_000)
    throw new Error("Invalid next Android code.");
  return {
    version: `${major}.${minor}.${patch + 1}`,
    versionCode,
    date,
    items,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const notesUrl = new URL(
    "../apps/web-svelte/src/lib/content/changelog.json",
    import.meta.url,
  );
  const packageUrl = new URL(
    "../apps/web-svelte/package.json",
    import.meta.url,
  );
  const notes = JSON.parse(readFileSync(notesUrl, "utf8"));
  const pkg = JSON.parse(readFileSync(packageUrl, "utf8"));
  if (pkg.version !== notes.versions[0].version)
    throw new Error(
      "Existing release versions disagree; repair them before preparing a release.",
    );
  const release = nextRelease(notes.versions, process.argv.slice(2));
  notes.versions.unshift(release);
  pkg.version = release.version;
  writeFileSync(notesUrl, JSON.stringify(notes, null, 2) + "\n");
  writeFileSync(packageUrl, JSON.stringify(pkg, null, 2) + "\n");
  console.log(
    `Prepared ${release.version} (${release.versionCode}); Gradle reads these values automatically.`,
  );
}
