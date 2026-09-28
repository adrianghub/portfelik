import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const versions = JSON.parse(
  readFileSync(resolve(root, "apps/web-svelte/src/lib/content/changelog.json"), "utf8")
).versions;
const entry = versions[0];
if (!entry) {
  console.error("changelog is empty");
  process.exit(1);
}

const [year, month, day] = entry.date.split("-").map(Number);
const date = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date(year, month - 1, day));

const lines = [`# ${entry.version}`, "", date, "", `Kod wersji ${entry.versionCode}.`, ""];
for (const item of entry.items) lines.push(`- ${item}`);
lines.push("");
process.stdout.write(lines.join("\n"));
