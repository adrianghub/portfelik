import { svelte, vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const cwd = process.cwd();

// Component (DOM) tests. Separate from the node-env unit/service/RLS configs.
// configFile:false skips svelte.config.js so the SvelteKit `kit` adapter config
// is not loaded here; vitePreprocess handles `<script lang="ts">`. svelteTesting()
// registers auto-cleanup and the browser resolve condition.
export default defineConfig({
  plugins: [svelte({ configFile: false, preprocess: vitePreprocess() }), svelteTesting()],
  resolve: {
    alias: {
      $lib: resolve(cwd, "src/lib"),
    },
  },
  test: {
    include: ["tests/components/**/*.spec.ts"],
    environment: "jsdom",
  },
});
