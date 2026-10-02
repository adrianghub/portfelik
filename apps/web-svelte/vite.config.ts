import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig, loadEnv } from "vite";
import packageJson from "./package.json" with { type: "json" };
import tailwindcss from "@tailwindcss/vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig(({ mode }) => {
  const releaseChannel =
    loadEnv(mode, process.cwd(), "PUBLIC_").PUBLIC_RELEASE_CHANNEL ?? "internal-beta";
  if (!["internal-beta", "public-beta", "stable"].includes(releaseChannel))
    throw new Error("Invalid PUBLIC_RELEASE_CHANNEL");
  return {
    define: {
      __RELEASE_CHANNEL__: JSON.stringify(releaseChannel),
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    server: { watch: { ignored: ["**/test-results*/**", "**/playwright-report/**"] } },
    plugins: [
      tailwindcss(),
      paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/lib/paraglide" }),
      sveltekit(),
    ],
  };
});
