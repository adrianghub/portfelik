import assert from "node:assert/strict";
import { test } from "node:test";
import { uploadDecision } from "./play-release-state.mjs";
import { nextRelease } from "./prepare-release.mjs";

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
