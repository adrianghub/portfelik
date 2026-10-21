/** A staging lease expires on the server even if the operator/workflow disappears. */
export function stagingSoakAllowed(
  env: (name: string) => string | undefined,
  now = Date.now(),
): boolean {
  if (env("SUPABASE_URL") !== "https://nveyzxxnyccpnesebvuw.supabase.co") {
    return true;
  }
  const start = Date.parse(env("DEMO_SOAK_STARTED_AT") ?? "");
  const end = Date.parse(env("DEMO_SOAK_EXPIRES_AT") ?? "");
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start <= now &&
    now < end &&
    end > start &&
    end - start <= 60 * 60_000 &&
    env("DEMO_PROVISION_REQUIRE_TURNSTILE") === "true" &&
    Boolean(env("DEMO_TURNSTILE_SECRET")) &&
    Boolean(env("DEMO_PROVISION_CLIENT_SALT")) &&
    !env("DEMO_PROVISION_TRUSTED_IP_HEADER") &&
    env("DEMO_PROVISION_RATE_WINDOW_SECONDS") === "7200" &&
    env("DEMO_PROVISION_RATE_MAX") === "3" &&
    env("DEMO_PROVISION_GLOBAL_MAX_ACTIVE") === "3"
  );
}
