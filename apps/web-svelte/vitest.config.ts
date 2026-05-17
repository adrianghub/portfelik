import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { defineConfig } from "vitest/config";

// Populate process.env from .env.test.example (committed local Supabase
// demo creds, identical on every machine) and let .env.test override
// when present (gitignored, per-dev). CI continues to inject vars via
// $GITHUB_ENV — that path takes precedence over both because each
// loader skips keys already set.
//
// Files are parsed manually rather than via Vite's loadEnv since
// loadEnv wouldn't pick up .env.test.example (it's not in its known
// filename list) and dotenv would be a fresh dep.
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const cwd = process.cwd();
loadEnvFile(resolve(cwd, ".env.test"));
loadEnvFile(resolve(cwd, ".env.test.example"));

export default defineConfig({
  test: {
    include: ["tests/rls/**/*.spec.ts"],
    environment: "node",
    // Spec files share the cached two-user context defined in setup.ts.
    // Disabling isolation prevents the test runner from re-initializing
    // setup.ts per file (which would race on auth.admin.createUser).
    isolate: false,
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
