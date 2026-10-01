import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
  server: { watch: { ignored: ["**/test-results*/**", "**/playwright-report/**"] } },
  plugins: [
    tailwindcss(),
    paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/lib/paraglide" }),
    sveltekit(),
  ],
});
