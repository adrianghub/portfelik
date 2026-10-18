/**
 * B2 open-demo-account Edge handler (prep only — do not deploy publicly yet).
 *
 * Session contract: Admin createUser → register_demo_identity → verify both
 * markers → generateLink(magiclink) → return hashed_token for client verifyOtp.
 * Never issue a session when registration is incomplete; delete orphan Auth users.
 *
 * hashed_token is a full credential: never log it.
 */

export type DemoProvisionClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  auth: {
    admin: {
      createUser: (input: {
        email: string;
        email_confirm: boolean;
        app_metadata: Record<string, unknown>;
        user_metadata?: Record<string, unknown>;
      }) => Promise<{
        data: { user: { id: string; email?: string | null } | null };
        error: { message?: string } | null;
      }>;
      deleteUser: (id: string) => Promise<{ error: { message?: string } | null }>;
      generateLink: (input: {
        type: "magiclink";
        email: string;
      }) => Promise<{
        data: {
          properties?: { hashed_token?: string | null; email_otp?: string | null } | null;
        } | null;
        error: { message?: string } | null;
      }>;
      updateUserById: (
        id: string,
        attributes: { app_metadata?: Record<string, unknown> }
      ) => Promise<{ error: { message?: string } | null }>;
    };
  };
};

export type DemoProvisionClientFactory = (
  url: string,
  key: string,
  options: { auth: { persistSession: boolean; autoRefreshToken: boolean } }
) => DemoProvisionClient;

export type DemoProvisionDeps = {
  randomUUID: () => string;
  nowMs?: () => number;
};

const DEMO_EMAIL_DOMAIN = "demo.jakstoimy.local";

/** In-process rate window for local/tests. Production needs durable limits. */
const provisionHits: number[] = [];

export function createOpenDemoAccountHandler(
  env: (name: string) => string | undefined,
  createClient: DemoProvisionClientFactory,
  deps: DemoProvisionDeps
) {
  const alwaysAllowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://app.jakstoimy.pl",
    "https://dev.portfelik.pages.dev",
    "https://localhost",
    "capacitor://localhost",
  ];
  const allowedOrigins = new Set([
    ...alwaysAllowedOrigins,
    ...(env("APP_ORIGINS") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ]);

  function headersFor(req: Request): HeadersInit {
    const origin = req.headers.get("origin") ?? "";
    return {
      "access-control-allow-origin": allowedOrigins.has(origin) ? origin : "",
      "access-control-allow-headers":
        "authorization, apikey, content-type, x-client-info",
      "access-control-allow-methods": "POST, OPTIONS",
      "content-type": "application/json",
      vary: "Origin",
    };
  }

  function json(req: Request, body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: headersFor(req),
    });
  }

  function syntheticDemoEmail(): string {
    return `demo+${deps.randomUUID()}@${DEMO_EMAIL_DOMAIN}`;
  }

  function rateLimited(): boolean {
    const windowMs = Number(env("DEMO_PROVISION_RATE_WINDOW_MS") ?? 60_000);
    const max = Number(env("DEMO_PROVISION_RATE_MAX") ?? 20);
    const now = (deps.nowMs ?? Date.now)();
    while (provisionHits.length > 0 && provisionHits[0]! < now - windowMs) {
      provisionHits.shift();
    }
    if (provisionHits.length >= max) return true;
    provisionHits.push(now);
    return false;
  }

  async function cleanupOrphan(admin: DemoProvisionClient, userId: string): Promise<void> {
    await admin.auth.admin.deleteUser(userId);
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: headersFor(req) });
    }
    if (req.method !== "POST") {
      return json(req, { error: "method_not_allowed" }, 405);
    }

    // Public provisioner stays gated until explicit ship approval.
    if ((env("DEMO_PROVISION_ENABLED") ?? "").toLowerCase() !== "true") {
      return json(req, { error: "demo_provision_disabled" }, 503);
    }

    if (rateLimited()) {
      return json(req, { error: "rate_limited" }, 429);
    }

    const url = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      return json(req, { error: "misconfigured" }, 500);
    }

    // Reject caller-supplied identity — provisioner invents the email.
    let body: unknown = null;
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : null;
    } catch {
      return json(req, { error: "bad_json" }, 400);
    }
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      if (record.email != null || record.userId != null || record.user_id != null) {
        return json(req, { error: "identity_not_accepted" }, 400);
      }
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const email = syntheticDemoEmail();
    let userId: string | null = null;

    try {
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        app_metadata: { account_kind: "demo" },
        user_metadata: { display_name: "Konto demo" },
      });
      if (created.error || !created.data.user?.id) {
        return json(req, { error: "provision_failed" }, 500);
      }
      userId = created.data.user.id;

      const registered = await admin.rpc("register_demo_identity", {
        p_user_id: userId,
      });
      if (registered.error) {
        await cleanupOrphan(admin, userId);
        return json(req, { error: "provision_failed" }, 500);
      }

      const verified = await admin.rpc("is_demo_account", { p_user_id: userId });
      if (verified.error || verified.data !== true) {
        await cleanupOrphan(admin, userId);
        return json(req, { error: "provision_failed" }, 500);
      }

      // Never mint a link outside the synthetic demo domain or for a mismatched echo.
      const echoedEmail = created.data.user.email ?? null;
      if (
        !email.endsWith(`@${DEMO_EMAIL_DOMAIN}`) ||
        (echoedEmail != null && echoedEmail !== email)
      ) {
        await cleanupOrphan(admin, userId);
        return json(req, { error: "provision_failed" }, 500);
      }

      const link = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      const hashedToken = link.data?.properties?.hashed_token;
      if (link.error || !hashedToken || typeof hashedToken !== "string") {
        await cleanupOrphan(admin, userId);
        return json(req, { error: "provision_failed" }, 500);
      }

      // tokenHash only — never return a GoTrue session for an existing identity.
      return json(req, {
        userId,
        email,
        // Client exchanges via verifyOtp({ token_hash, type: "email" }).
        tokenHash: hashedToken,
        verifyType: "email",
      });
    } catch {
      if (userId) {
        try {
          await cleanupOrphan(admin, userId);
        } catch {
          // Best-effort orphan cleanup; durable sweeper is a B2 follow-up.
        }
      }
      return json(req, { error: "provision_failed" }, 500);
    }
  };
}

/** Test helper: clear the in-process rate window. */
export function resetDemoProvisionRateLimitForTests(): void {
  provisionHits.length = 0;
}
