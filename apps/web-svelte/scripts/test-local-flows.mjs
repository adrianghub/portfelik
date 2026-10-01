import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const status = JSON.parse(
  execFileSync(process.env.SUPABASE_CLI ?? "supabase", ["status", "-o", "json"], {
    cwd: root,
    encoding: "utf8",
  })
);
const url = new URL(status.API_URL);
if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
  throw new Error("Refusing to provision/delete quality fixtures outside local loopback Supabase.");
}
if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY)
  throw new Error("Local Supabase keys are unavailable.");
const result = spawnSync(
  "corepack",
  [
    "pnpm@10",
    "exec",
    "playwright",
    "test",
    "--config=playwright.local.config.ts",
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      QUALITY_LOCAL_FIXTURES: "1",
      QUALITY_SUPABASE_URL: status.API_URL,
      QUALITY_SUPABASE_ANON_KEY: status.ANON_KEY,
      QUALITY_SUPABASE_SERVICE_KEY: status.SERVICE_ROLE_KEY,
    },
  }
);
process.exit(result.status ?? 1);
