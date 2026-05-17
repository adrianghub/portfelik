import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

// Populate process.env from .env.test so RLS specs can run with
// `pnpm test:rls` directly — no need for the long inline `SUPABASE_URL=...
// pnpm test:rls` invocation. .env.test holds local Supabase demo creds
// (public, identical on every dev machine). Real cloud creds stay in
// .env.cloud.local (gitignored) and are not used here.
const env = loadEnv("test", process.cwd(), "");
for (const [k, v] of Object.entries(env)) {
  if (!process.env[k]) process.env[k] = v;
}

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
