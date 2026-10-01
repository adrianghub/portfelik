import { defineConfig, devices } from "@playwright/test";

if (process.env.QUALITY_LOCAL_FIXTURES !== "1") {
  throw new Error(
    "Run through pnpm test:e2e:local so the loopback database guard and fixture env are set."
  );
}
export default defineConfig({
  testDir: "./e2e/local",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60000,
  outputDir: "test-results-local",
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5174", trace: "retain-on-failure" },
  projects: [{ name: "local-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    env: {
      PUBLIC_SUPABASE_URL: process.env.QUALITY_SUPABASE_URL!,
      PUBLIC_SUPABASE_ANON_KEY: process.env.QUALITY_SUPABASE_ANON_KEY!,
      PUBLIC_VAPID_KEY: "",
      PUBLIC_PLAUSIBLE_DOMAIN: "",
    },
  },
});
