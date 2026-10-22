import { expect, it } from "vitest";
import { stagingSoakAllowed } from "../../../../supabase/functions/open-demo-account/staging-soak";

function config(): Record<string, string> {
  return {
    SUPABASE_URL: "https://nveyzxxnyccpnesebvuw.supabase.co",
    DEMO_STAGING_ALWAYS_ENABLED: "true",
    DEMO_PROVISION_REQUIRE_TURNSTILE: "true",
    DEMO_TURNSTILE_SECRET: "test-secret",
    DEMO_PROVISION_CLIENT_SALT: "test-salt",
    DEMO_PROVISION_RATE_WINDOW_SECONDS: "7200",
    DEMO_PROVISION_RATE_MAX: "3",
    DEMO_PROVISION_GLOBAL_MAX_ACTIVE: "3",
  };
}

it("allows explicitly persistent staging with safeguards despite expired lease", () => {
  const c = {
    ...config(),
    DEMO_SOAK_STARTED_AT: "2026-10-01T00:00:00Z",
    DEMO_SOAK_EXPIRES_AT: "2026-10-01T01:00:00Z",
  };
  expect(stagingSoakAllowed((k) => c[k as keyof typeof c])).toBe(true);
});

it("does not silently enable persistent staging without exact opt-in", () => {
  const c = config();
  c.DEMO_STAGING_ALWAYS_ENABLED = "false";
  expect(stagingSoakAllowed((k) => c[k])).toBe(false);
});

it.each([
  "DEMO_PROVISION_REQUIRE_TURNSTILE",
  "DEMO_TURNSTILE_SECRET",
  "DEMO_PROVISION_CLIENT_SALT",
  "DEMO_PROVISION_RATE_WINDOW_SECONDS",
  "DEMO_PROVISION_RATE_MAX",
  "DEMO_PROVISION_GLOBAL_MAX_ACTIVE",
])("refuses persistent staging without safeguard %s", (key) => {
  const c = config();
  delete c[key];
  expect(stagingSoakAllowed((k) => c[k])).toBe(false);
});

it("refuses a trusted-IP override that would split the shared staging budget", () => {
  const c = { ...config(), DEMO_PROVISION_TRUSTED_IP_HEADER: "x-custom-ip" };
  expect(stagingSoakAllowed((k) => c[k as keyof typeof c])).toBe(false);
});
