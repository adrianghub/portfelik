import assert from "node:assert/strict";
import { test } from "node:test";
import { uploadDecision } from "./play-release-state.mjs";
import { nextRelease } from "./prepare-release.mjs";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

test("release command updates both files and produces formatted JSON", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const fixture = mkdtempSync(resolve(tmpdir(), "portfelik-release-fixture-"));
  try {
    mkdirSync(`${fixture}/scripts`, { recursive: true });
    const web = `${fixture}/apps/web-svelte`;
    mkdirSync(`${web}/src/lib/content`, { recursive: true });
    cpSync(
      `${root}/scripts/prepare-release.mjs`,
      `${fixture}/scripts/prepare-release.mjs`,
    );
    for (const file of [
      "package.json",
      ".prettierrc.json",
      "src/lib/content/changelog.json",
    ]) {
      cpSync(`${root}/apps/web-svelte/${file}`, `${web}/${file}`);
    }
    symlinkSync(`${root}/apps/web-svelte/node_modules`, `${web}/node_modules`);
    const before = JSON.parse(
      readFileSync(`${web}/src/lib/content/changelog.json`, "utf8"),
    ).versions;
    execFileSync(process.execPath, [
      `${fixture}/scripts/prepare-release.mjs`,
      "Automatyczna numeracja.",
    ]);
    const after = JSON.parse(
      readFileSync(`${web}/src/lib/content/changelog.json`, "utf8"),
    ).versions;
    assert.deepEqual(
      after[0],
      nextRelease(before, ["Automatyczna numeracja."]),
    );
    assert.deepEqual(after.slice(1), before);
    assert.equal(
      JSON.parse(readFileSync(`${web}/package.json`, "utf8")).version,
      after[0].version,
    );
    execFileSync(
      `${root}/apps/web-svelte/node_modules/.bin/prettier`,
      ["--check", "package.json", "src/lib/content/changelog.json"],
      { cwd: web },
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("new release derives the next name and Android code", () => {
  assert.deepEqual(
    nextRelease(
      [{ version: "1.3.4", versionCode: 12 }],
      ["Poprawki."],
      "2026-10-02",
    ),
    {
      version: "1.3.5",
      versionCode: 13,
      date: "2026-10-02",
      items: ["Poprawki."],
    },
  );
  assert.throws(() => nextRelease([{ version: "1.3.4", versionCode: 12 }], []));
});
test("Play preflight accepts an unused code and handles repeat runs", () => {
  assert.equal(uploadDecision(12, [{ versionCode: 11 }], []), true);
  const tracks = [
    {
      track: "internal",
      releases: [{ status: "completed", versionCodes: ["12"] }],
    },
  ];
  assert.equal(uploadDecision(12, [{ versionCode: 12 }], tracks), false);
});
test("Play preflight blocks occupied codes, drafts and regressions", () => {
  assert.throws(() => uploadDecision(12, [{ versionCode: 12 }], []));
  assert.throws(() =>
    uploadDecision(
      12,
      [],
      [
        {
          track: "internal",
          releases: [{ status: "draft", versionCodes: ["12"] }],
        },
      ],
    ),
  );
  assert.throws(() => uploadDecision(12, [{ versionCode: 13 }], []));
});
