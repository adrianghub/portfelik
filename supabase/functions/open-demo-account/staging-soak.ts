/** Staging requires bounded safeguards and either an explicit persistent opt-in or a lease. */
export function stagingSoakAllowed(
  env: (name: string) => string | undefined,
  now = Date.now(),
): boolean {
  if (env("SUPABASE_URL") !== "https://nveyzxxnyccpnesebvuw.supabase.co") {
    return true;
  }
  const safeguards =
    env("DEMO_PROVISION_REQUIRE_TURNSTILE") === "true" &&
    Boolean(env("DEMO_TURNSTILE_SECRET")) &&
    Boolean(env("DEMO_PROVISION_CLIENT_SALT")) &&
    !env("DEMO_PROVISION_TRUSTED_IP_HEADER") &&
    env("DEMO_PROVISION_RATE_WINDOW_SECONDS") === "7200" &&
    env("DEMO_PROVISION_RATE_MAX") === "3" &&
    env("DEMO_PROVISION_GLOBAL_MAX_ACTIVE") === "3";
  if (!safeguards) return false;
  // Only the exact staging URL reaches this opt-in. The handler's master kill
  // switch still applies; production behavior and configuration are unchanged.
  if (env("DEMO_STAGING_ALWAYS_ENABLED") === "true") return true;
  const start = Date.parse(env("DEMO_SOAK_STARTED_AT") ?? "");
  const end = Date.parse(env("DEMO_SOAK_EXPIRES_AT") ?? "");
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start <= now &&
    now < end &&
    end > start &&
    end - start <= 60 * 60_000
  );
}
