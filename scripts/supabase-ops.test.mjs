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
