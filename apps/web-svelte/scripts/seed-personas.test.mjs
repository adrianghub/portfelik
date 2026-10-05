import assert from "node:assert/strict";
import { test } from "node:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function firstAuthRequest(envLines) {
  const fixture = mkdtempSync(resolve(tmpdir(), "portfelik-persona-seed-"));
  try {
    const app = `${fixture}/apps/web-svelte`;
    const sdk = `${app}/node_modules/@supabase/supabase-js`;
    mkdirSync(`${fixture}/scripts`, { recursive: true });
    mkdirSync(`${fixture}/bin`);
    mkdirSync(`${app}/scripts`, { recursive: true });
    mkdirSync(sdk, { recursive: true });
    for (const file of ["supabase-ops.sh", "load-local-env.sh"]) {
      cpSync(`${root}/scripts/${file}`, `${fixture}/scripts/${file}`);
    }
    cpSync(`${root}/apps/web-svelte/scripts/seed-personas.mjs`, `${app}/scripts/seed-personas.mjs`);
    writeFileSync(
      `${fixture}/bin/pnpm`,
      "#!/bin/sh\nexport SEED_TARGET=local\nexec node ./scripts/seed-personas.mjs\n",
      { mode: 0o700 }
    );
    writeFileSync(`${sdk}/package.json`, JSON.stringify({ type: "module", exports: "./index.js" }));
    writeFileSync(
      `${sdk}/index.js`,
      `export function createClient() {
      return { auth: { admin: {
        async listUsers() { return { data: { users: [] } }; },
        async createUser(params) {
          console.log('FIXTURE_AUTH_PARAMS=' + JSON.stringify(params));
          return { error: { message: 'fixture stopped after auth request' } };
        }
      } } };
    }`
    );
    writeFileSync(
      `${app}/.env.test`,
      [
        "SUPABASE_URL=http://127.0.0.1:54321",
        "SUPABASE_SERVICE_ROLE_KEY=local-fixture-role",
        ...envLines,
      ].join("\n")
    );
    const result = spawnSync("bash", [`${fixture}/scripts/supabase-ops.sh`, "local", "seed"], {
      env: { PATH: `${fixture}/bin:${process.env.PATH}` },
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /fixture stopped after auth request/);
    const captured = result.stdout
      .split("\n")
      .find((line) => line.startsWith("FIXTURE_AUTH_PARAMS="));
    assert.ok(captured, "the real seeding command must reach Auth");
    return JSON.parse(captured.slice("FIXTURE_AUTH_PARAMS=".length));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test("local seed uses default login/password when optional overrides are empty", () => {
  const params = firstAuthRequest([
    "LOCAL_ADMIN_EMAIL=",
    "LOCAL_ADMIN_PASSWORD=",
    "SEED_ADMIN_EMAIL=",
    "SEED_ADMIN_PASSWORD=",
  ]);
  assert.equal(params.email, "admin@portfelik.test");
  assert.equal(params.password, params.email);
});

test("local overrides take precedence and retain the supplied password", () => {
  const params = firstAuthRequest([
    "LOCAL_ADMIN_EMAIL=custom@local.test",
    'LOCAL_ADMIN_PASSWORD=" password with spaces "',
    "SEED_ADMIN_EMAIL=fallback@local.test",
  ]);
  assert.equal(params.email, "custom@local.test");
  assert.equal(params.password, " password with spaces ");
});
