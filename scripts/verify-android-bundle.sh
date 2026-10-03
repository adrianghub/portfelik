#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bundle="${1:?usage: verify-android-bundle.sh path/to/app-release.aab}"
jar="$(mktemp)"
manifest="$(mktemp)"
trap 'rm -f "$jar" "$manifest"' EXIT
curl -fsSL --retry 3 --connect-timeout 15 --max-time 120 \
  -o "$jar" https://github.com/google/bundletool/releases/download/1.18.2/bundletool-all-1.18.2.jar
node --input-type=module - "$jar" <<'JS'
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const checksum = createHash("sha256").update(readFileSync(process.argv[2])).digest("hex");
if (checksum !== "378b5434cd1378bef6b2bc527b8c7f0ff2584b273830335bce54d6d0813c8584") {
  throw new Error("bundletool checksum mismatch");
}
JS
java -jar "$jar" dump manifest --bundle="$bundle" --module=base > "$manifest"
node --input-type=module - "$ROOT" "$manifest" <<'JS'
import { readFileSync } from "node:fs";
const root = process.argv[2];
const xml = readFileSync(process.argv[3], "utf8");
const release = JSON.parse(readFileSync(`${root}/apps/web-svelte/src/lib/content/changelog.json`, "utf8")).versions[0];
const name = xml.match(/android:versionName="([^"]+)"/)?.[1];
const code = Number(xml.match(/android:versionCode="(\d+)"/)?.[1]);
const packageName = xml.match(/\bpackage="([^"]+)"/)?.[1];
if (name !== release.version || code !== release.versionCode || packageName !== "pl.jakstoimy.app") {
  throw new Error(`AAB metadata mismatch: ${packageName} ${name} (${code}); expected pl.jakstoimy.app ${release.version} (${release.versionCode})`);
}
console.log(`Verified actual AAB: ${name} (${code}).`);
JS
