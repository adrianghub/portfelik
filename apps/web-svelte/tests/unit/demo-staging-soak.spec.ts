import { describe, expect, it } from "vitest";
import { stagingSoakAllowed } from "../../../../supabase/functions/open-demo-account/staging-soak";

const start = Date.parse("2026-10-21T12:00:00Z");
const config = (): Record<string, string> => ({
  SUPABASE_URL: "https://nveyzxxnyccpnesebvuw.supabase.co",
  DEMO_SOAK_STARTED_AT: new Date(start).toISOString(),
  DEMO_SOAK_EXPIRES_AT: new Date(start + 3_600_000).toISOString(),
  DEMO_PROVISION_REQUIRE_TURNSTILE: "true",
  DEMO_TURNSTILE_SECRET: "test-secret",
  DEMO_PROVISION_CLIENT_SALT: "fixed-test-salt",
  DEMO_PROVISION_RATE_WINDOW_SECONDS: "7200",
  DEMO_PROVISION_RATE_MAX: "3",
  DEMO_PROVISION_GLOBAL_MAX_ACTIVE: "3",
});

describe("staging soak server lease", () => {
  it("expires without a timer, workflow callback or configuration update", () => {
    const values = config();
    const env = (key: string) => values[key];
    expect(stagingSoakAllowed(env, start - 1)).toBe(false);
    expect(stagingSoakAllowed(env, start)).toBe(true);
    expect(stagingSoakAllowed(env, start + 3_599_999)).toBe(true);
    expect(stagingSoakAllowed(env, start + 3_600_000)).toBe(false);
    expect(stagingSoakAllowed(env, start + 7_200_000)).toBe(false);
  });

  it.each([
    ["DEMO_SOAK_STARTED_AT", ""],
    ["DEMO_SOAK_EXPIRES_AT", "invalid"],
    ["DEMO_SOAK_EXPIRES_AT", new Date(start + 3_600_001).toISOString()],
    ["DEMO_SOAK_EXPIRES_AT", new Date(start).toISOString()],
    ["DEMO_PROVISION_REQUIRE_TURNSTILE", "false"],
    ["DEMO_TURNSTILE_SECRET", ""],
    ["DEMO_PROVISION_CLIENT_SALT", ""],
    ["DEMO_PROVISION_TRUSTED_IP_HEADER", "cf-connecting-ip"],
    ["DEMO_PROVISION_RATE_WINDOW_SECONDS", "60"],
    ["DEMO_PROVISION_RATE_MAX", "4"],
    ["DEMO_PROVISION_GLOBAL_MAX_ACTIVE", "50"],
  ])("rejects unsafe %s", (key, value) => {
    const values = { ...config(), [key]: value };
    expect(stagingSoakAllowed((name) => values[name], start)).toBe(false);
  });

  it("leaves local and production behavior to their existing kill switch", () => {
    for (const url of ["http://127.0.0.1:54321", "https://production.example"]) {
      expect(stagingSoakAllowed((key) => (key === "SUPABASE_URL" ? url : undefined))).toBe(true);
    }
  });
});
