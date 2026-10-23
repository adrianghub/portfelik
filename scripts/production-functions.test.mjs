import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/deploy-production.yml", import.meta.url),
  "utf8",
);
// Exercise the actual workflow shell, including its allowlist, without a remote.
const body = workflow
  .split("      - name: Deploy changed production Edge Functions\n")[1]
  .split("        run: |\n")[1]
  .split("\n  deploy:\n")[0]
  .replace(/^ {10}/gm, "");
const managed = [
  "open-demo-account",
  "send-admin-summary",
  "send-group-invitation",
  "send-push",
  "sync-user-role",
];

for (const changed of [
  "supabase/functions/open-demo-account/index.ts",
  "supabase/config.toml",
  ".github/workflows/deploy-production.yml",
  "supabase/functions/unmanaged/index.ts",
  "README.md",
]) {
  test(`production deployment handles ${changed}`, () => {
    const root = mkdtempSync(join(tmpdir(), "production-functions-"));
    try {
      const git = (...args) =>
        execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
      git("init", "-q");
      git("config", "user.email", "test@example.invalid");
      git("config", "user.name", "Test");
      for (const name of [...managed, "unmanaged"]) {
        mkdirSync(join(root, "supabase/functions", name), { recursive: true });
        writeFileSync(
          join(root, "supabase/functions", name, "index.ts"),
          "// before\n",
        );
      }
      mkdirSync(join(root, ".github/workflows"), { recursive: true });
      for (const file of [
        "README.md",
        "supabase/config.toml",
        ".github/workflows/deploy-production.yml",
      ]) {
        writeFileSync(join(root, file), "before\n");
      }
      git("add", ".");
      git("commit", "-qm", "before");
      const before = git("rev-parse", "HEAD");
      writeFileSync(join(root, changed), "after\n");
      git("add", ".");
      git("commit", "-qm", "after");
      mkdirSync(join(root, "bin"));
      writeFileSync(
        join(root, "bin/supabase"),
        '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$DEPLOY_LOG"\n',
        { mode: 0o755 },
      );
      const log = join(root, "deploy.log");
      const result = spawnSync("bash", ["-euo", "pipefail", "-c", body], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${join(root, "bin")}:${process.env.PATH}`,
          BEFORE_SHA: before,
          GITHUB_SHA: git("rev-parse", "HEAD"),
          PROD_SUPABASE_PROJECT_REF: "production-fixture",
          DEPLOY_LOG: log,
        },
      });
      if (changed.includes("unmanaged")) {
        assert.notEqual(result.status, 0);
        assert.match(result.stdout, /not managed by production deploy/);
      } else {
        assert.equal(result.status, 0, result.stderr);
        const expected =
          changed.endsWith(".yml") || changed.endsWith(".toml")
            ? managed
            : changed.includes("open-demo-account")
              ? ["open-demo-account"]
              : [];
        const actual = expected.length
          ? readFileSync(log, "utf8").trim().split("\n").sort()
          : [];
        assert.deepEqual(
          actual,
          expected
            .map(
              (name) =>
                `functions deploy ${name} --project-ref production-fixture`,
            )
            .sort(),
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
