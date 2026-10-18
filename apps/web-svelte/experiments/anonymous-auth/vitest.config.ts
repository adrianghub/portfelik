import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["experiments/anonymous-auth/*.spec.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
