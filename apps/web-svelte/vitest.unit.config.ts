import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const cwd = process.cwd();

export default defineConfig({
  resolve: {
    alias: {
      $lib: resolve(cwd, "src/lib"),
      "$app/environment": resolve(cwd, "tests/mocks/app-environment.ts"),
      "$env/static/public": resolve(cwd, "tests/mocks/env-static-public.ts"),
    },
  },
  test: {
    // Pure units + mocked-supabase service tests. Both run in node (no DB, no DOM):
    // service specs vi.mock("$lib/supabase") so the SvelteKit $env import never loads.
    include: ["tests/unit/**/*.spec.ts", "tests/services/**/*.spec.ts"],
    environment: "node",
  },
});
