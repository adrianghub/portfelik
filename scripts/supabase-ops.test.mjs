import assert from "node:assert/strict";
import { test } from "node:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function withoutRemoteCredentials(run) {
  const fixture = mkdtempSync(resolve(tmpdir(), "portfelik-supabase-ops-"));
  try {
    mkdirSync(`${fixture}/scripts`);
    mkdirSync(`${fixture}/bin`);
    for (const file of ["supabase-ops.sh", "load-local-env.sh"]) {
      cpSync(`${root}/scripts/${file}`, `${fixture}/scripts/${file}`);
    }
    writeFileSync(
      `${fixture}/bin/supabase`,
      '#!/bin/sh\nprintf "%s\\n" "$@"\n',
      { mode: 0o700 },
    );
    const env = { PATH: `${fixture}/bin:${process.env.PATH}` };
    run(
      (...args) =>
        spawnSync("bash", [`${fixture}/scripts/supabase-ops.sh`, ...args], {
          env,
          encoding: "utf8",
        }),
      fixture,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test("help and local operations work without supabase/.env or remote credentials", () => {
  withoutRemoteCredentials((execute, fixture) => {
    const help = execute("help");
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Usage:/);
    for (const [operation, expected] of [
      ["start", ["start"]],
      ["reset", ["db", "reset", "--local"]],
    ]) {
      const result = execute("local", operation);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.stdout.trim().split("\n"), [
        ...expected,
        "--workdir",
        fixture,
      ]);
    }
  });
});

test("remote writes still require explicit target confirmation", () => {
  withoutRemoteCredentials((execute) => {
    const result = execute("prod", "push");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /mutation requires: --confirm prod/);
    assert.equal(result.stdout, "");
  });
});

test("staging previews include earlier feature migrations without broadening production", () => {
  withoutRemoteCredentials((execute, fixture) => {
    mkdirSync(`${fixture}/supabase`);
    writeFileSync(`${fixture}/supabase/.env`, [
      "STAGING_SUPABASE_PROJECT_REF=staging-fixture",
      "STAGING_SUPABASE_DB_PASSWORD=fixture-not-a-secret",
      "PROD_SUPABASE_PROJECT_REF=prod-fixture",
      "PROD_SUPABASE_DB_PASSWORD=fixture-not-a-secret",
    ].join("\n"));
    for (const target of ["staging", "prod"]) {
      const preview = execute(target, "push-preview");
      assert.equal(preview.status, 0, preview.stderr);
      assert.match(preview.stdout, /--dry-run/);
      assert.equal(preview.stdout.includes("--include-all"), target === "staging");
      assert.doesNotMatch(preview.stdout, /--yes/);
    }
  });
});

test("manual staging refuses production, unexpected branches and changed source commits", () => {
  const sha = "a".repeat(40);
  for (const [event, branch, actual, expected, accepted] of [
    ["push", "dev", sha, "", true],
    ["push", "main", sha, "", false],
    ["workflow_dispatch", "dev", sha, sha, true],
    ["workflow_dispatch", "codex/jakstoimy-1-4-demo-ui", sha, sha, true],
    ["workflow_dispatch", "codex/jakstoimy-1-4-auth-demo", sha, sha, true],
    ["workflow_dispatch", "main", sha, sha, false],
    ["workflow_dispatch", "other-feature", sha, sha, false],
    ["workflow_dispatch", "dev", sha, "b".repeat(40), false],
    ["workflow_dispatch", "dev", "", "", false],
    ["pull_request", "dev", sha, sha, false],
  ]) {
    const result = spawnSync("bash", [resolve(root, "scripts/check-staging-source.sh"), event, branch, actual, expected], { encoding: "utf8" });
    assert.equal(result.status === 0, accepted, `${event}/${branch}: ${result.stderr}`);
  }
});
