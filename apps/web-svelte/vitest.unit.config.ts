import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const cwd = process.cwd();

export default defineConfig({
  resolve: {
    alias: {
      $lib: resolve(cwd, "src/lib"),
    },
  },
  test: {
    include: ["tests/unit/**/*.spec.ts"],
    environment: "node",
  },
});
