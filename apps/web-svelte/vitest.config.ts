import { defineConfig } from "vitest/config";

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
