import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  approvalDigest,
  makeManifest,
  parseHistory,
  verifyApproval,
  verifyPreview,
} from "./production-migrations.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const applied = "20261017000000";
const pending = "20261018144134";
const files = [applied, pending].map((version) => ({
  version,
  file: `${version}_example.sql`,
  sha256: "a".repeat(64),
}));
const history = `${applied} | ${applied} | date\n${pending} | | date\n`;
const manifest = () =>
  makeManifest(
    "b".repeat(40),
    files,
    parseHistory(history),
    "c".repeat(64),
    "d".repeat(40),
  );

test("history accepts CLI backticks and fails closed on empty, drifted or incomplete history", () => {
  assert.equal(
    parseHistory(history.replaceAll(applied, `\`${applied}\``)).length,
    2,
  );
  for (const output of [
    "",
    ` | ${applied} | date`,
    `${applied} | ${pending} | date`,
    `${applied} | bad | date`,
    history + history,
  ]) {
    assert.throws(() => parseHistory(output));
  }
  assert.throws(() =>
    makeManifest(
      "b".repeat(40),
      files,
      parseHistory(`${applied} | ${applied} | date`),
      "hash",
      "d".repeat(40),
    ),
  );
  assert.throws(() =>
    makeManifest(
      "b".repeat(40),
      files,
      [
        { version: applied, applied: false },
        { version: pending, applied: true },
      ],
      "hash",
      "d".repeat(40),
    ),
  );
});

test("approval binds candidate, trusted runner, SQL, configuration and exact pending set", () => {
  const plan = manifest();
  const digest = approvalDigest(plan);
  verifyApproval(plan, digest, "backup 2026-10-23 10:00 UTC");
  for (const changed of [
    { ...plan, candidate: "d".repeat(40) },
    { ...plan, trusted_runner_sha: "e".repeat(40) },
    { ...plan, config_sha256: "e".repeat(64) },
    { ...plan, pending: [] },
    {
      ...plan,
      migrations: [
        ...files.slice(0, 1),
        { ...files[1], sha256: "f".repeat(64) },
      ],
    },
  ])
    assert.throws(() => verifyApproval(changed, digest, "backup confirmed"));
  assert.throws(() => verifyApproval(plan, digest, ""));
  assert.throws(() => verifyApproval(plan, "", "backup confirmed"));
  verifyPreview(`Would push:\n • ${pending}_example.sql`, plan);
  assert.throws(() =>
    verifyPreview(`Would push:\n • ${applied}_example.sql`, plan),
  );
});

function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), "production-migrations-test-"));
  try {
    for (const path of [
      "scripts",
      "supabase/migrations",
      "supabase/templates",
      "bin",
    ])
      mkdirSync(join(dir, path), { recursive: true });
    for (const file of [
      "production-migrations.mjs",
      "supabase-ops.sh",
      "load-local-env.sh",
    ])
      cpSync(join(root, "scripts", file), join(dir, "scripts", file));
    writeFileSync(join(dir, "supabase/config.toml"), 'project_id = "test"\n');
    writeFileSync(
      join(dir, "supabase/templates/invite.html"),
      "<p>Trusted invite</p>\n",
    );
    for (const file of files)
      writeFileSync(join(dir, "supabase/migrations", file.file), "select 1;\n");
    const git = (...args) => {
      const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    git("init", "-q");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "add",
      ".",
    );
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-qm",
      "fixture",
    );
    const sha = git("rev-parse", "HEAD");
    // Candidate code must never execute: runner uses only the trusted on-disk dispatcher.
    writeFileSync(
      join(dir, "scripts/supabase-ops.sh"),
      'echo "candidate code ran" >&2\nexit 99\n',
    );
    git("add", ".");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-qm",
      "candidate code",
    );
    const candidate = git("rev-parse", "HEAD");
    git("checkout", sha, "--", "scripts/supabase-ops.sh");
    writeFileSync(
      join(dir, "bin/supabase"),
      `#!/bin/bash
set -eu
test -f "\${!#}/supabase/templates/invite.html"
printf '%s\\n' "$1 \${2:-}" >> "$CALL_LOG"
case "$1 \${2:-}" in
  'link '*) echo 'Finished supabase link.' ;;
  'migration list')
    if [[ -f "$PUSH_MARKER" && "\${POST_PUSH_DRIFT:-}" != true ]]; then
      printf '%s\\n' '${applied} | ${applied} | date' '${pending} | ${pending} | date'
    else
      printf '%s\\n' '${applied} | ${applied} | date' '${pending} | | date'
    fi ;;
  'db push')
    if [[ " $* " == *' --dry-run '* ]]; then
      printf 'Would push:\\n • ${pending}_example.sql\\n' >&2
    else
      touch "$PUSH_MARKER"
      echo 'Finished supabase db push.'
    fi ;;
  *) exit 98 ;;
esac
`,
      { mode: 0o700 },
    );
    const execute = (extra = {}) =>
      spawnSync("node", [join(dir, "scripts/production-migrations.mjs")], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${join(dir, "bin")}:${process.env.PATH}`,
          CANDIDATE_SHA: candidate,
          PROD_SUPABASE_PROJECT_REF: "emqzcygfwcvbmhxhfkcc",
          PROD_SUPABASE_DB_PASSWORD: "test-password",
          SUPABASE_ACCESS_TOKEN: "test-token",
          CALL_LOG: join(dir, "calls"),
          PUSH_MARKER: join(dir, "pushed"),
          ...extra,
        },
      });
    run({ dir, execute, git });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("preview never writes; stale apply never pushes; approved apply verifies parity", () => {
  fixture(({ dir, execute }) => {
    const preview = execute();
    assert.equal(preview.status, 0, JSON.stringify(preview));
    assert.equal(existsSync(join(dir, "pushed")), false);
    const report = JSON.parse(
      readFileSync(join(dir, "migration-report/result.json")),
    );
    const stale = execute({
      MIGRATION_OPERATION: "apply",
      APPROVED_MANIFEST_SHA256: "0".repeat(64),
      BACKUP_REFERENCE: "backup confirmed",
    });
    assert.equal(stale.status, 1);
    assert.equal(existsSync(join(dir, "pushed")), false);
    const appliedRun = execute({
      MIGRATION_OPERATION: "apply",
      APPROVED_MANIFEST_SHA256: report.approval_sha256,
      BACKUP_REFERENCE: "backup confirmed",
    });
    assert.equal(appliedRun.status, 0, appliedRun.stderr);
    assert.equal(
      JSON.parse(readFileSync(join(dir, "migration-report/result.json")))
        .status,
      "applied-and-verified",
    );
    assert.equal(existsSync(join(dir, "pushed")), true);
  });
});

test("wrong project fails before any CLI call; failed parity is reported as failure", () => {
  fixture(({ dir, execute }) => {
    assert.equal(execute({ PROD_SUPABASE_PROJECT_REF: "staging" }).status, 1);
    assert.equal(existsSync(join(dir, "calls")), false);
    assert.equal(execute().status, 0);
    const report = JSON.parse(
      readFileSync(join(dir, "migration-report/result.json")),
    );
    const result = execute({
      MIGRATION_OPERATION: "apply",
      APPROVED_MANIFEST_SHA256: report.approval_sha256,
      BACKUP_REFERENCE: "backup confirmed",
      POST_PUSH_DRIFT: "true",
    });
    assert.equal(result.status, 1);
    assert.equal(
      JSON.parse(readFileSync(join(dir, "migration-report/result.json")))
        .status,
      "failed",
    );
  });
});

test("advancing the trusted checkout invalidates approval for unchanged candidate SQL", () => {
  fixture(({ dir, execute, git }) => {
    assert.equal(execute().status, 0);
    const report = JSON.parse(
      readFileSync(join(dir, "migration-report/result.json")),
    );
    writeFileSync(
      join(dir, "scripts/load-local-env.sh"),
      readFileSync(join(dir, "scripts/load-local-env.sh"), "utf8") +
        "\n# Runner updated\n",
    );
    git("add", "scripts/load-local-env.sh");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-qm",
      "update trusted runner",
    );
    const result = execute({
      MIGRATION_OPERATION: "apply",
      APPROVED_MANIFEST_SHA256: report.approval_sha256,
      BACKUP_REFERENCE: "backup confirmed",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Approval is stale: trusted runner/);
    assert.equal(existsSync(join(dir, "pushed")), false);
    const updated = JSON.parse(
      readFileSync(join(dir, "migration-report/result.json")),
    );
    assert.equal(updated.candidate, report.candidate);
    assert.notEqual(updated.trusted_runner_sha, report.trusted_runner_sha);
  });
});
