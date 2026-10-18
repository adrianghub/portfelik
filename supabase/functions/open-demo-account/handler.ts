/**
 * B2 open-demo-account Edge handler (prep only — do not deploy publicly yet).
 *
 * Session contract: claim reservation → createUser (nonce) → getUserById
 * ownership → register → commit reservation → generateLink → tokenHash.
 *
 * Capacity: held reservations count toward the global cap until commit/release/expiry.
 *
 * Client keys: by default IP headers are NOT trusted (spoofable on Edge).
 * Rate limit uses a shared bucket; optional trusted header only when explicitly
 * configured after infrastructure verification. Turnstile is required when
 * DEMO_TURNSTILE_SECRET or DEMO_PROVISION_REQUIRE_TURNSTILE is set.
 *
 * hashed_token / tokenHash is a full credential: never log it.
 */

export type AuthUserShape = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
};

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
        data: { user: AuthUserShape | null };
        error: { message?: string } | null;
      }>;
      getUserById: (id: string) => Promise<{
        data: { user: AuthUserShape | null };
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
  sha256Hex?: (value: string) => Promise<string>;
  fetchFn?: typeof fetch;
};

const DEMO_EMAIL_DOMAIN = "demo.jakstoimy.local";

/** Shared rate-limit bucket when no verified ingress IP header is configured. */
export const SHARED_CLIENT_KEY_MATERIAL = "shared";

/**
 * Spoofable headers must never drive rate limits unless ops explicitly opts in
 * after verifying Supabase/CDN overwrites them. Default: ignore all IP headers.
 */
const SPOOFABLE_IP_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "true-client-ip",
  "forwarded",
] as const;

export type OwnedDemoIdentity = {
  userId: string;
  email: string;
  provisionNonce: string;
};

export function confirmOwnedDemoIdentity(
  inventedEmail: string,
  provisionNonce: string,
  user: AuthUserShape | null | undefined
): OwnedDemoIdentity | null {
  if (!user?.id || !provisionNonce) return null;
  if (!inventedEmail.endsWith(`@${DEMO_EMAIL_DOMAIN}`)) return null;
  const echoed = (user.email ?? "").toLowerCase();
  if (echoed !== inventedEmail.toLowerCase()) return null;
  const meta = user.app_metadata ?? {};
  if (meta.account_kind !== "demo") return null;
  if (meta.demo_provision_nonce !== provisionNonce) return null;
  return {
    userId: user.id,
    email: inventedEmail.toLowerCase(),
    provisionNonce,
  };
}

/**
 * Resolve rate-limit key material. Without an allowlisted trusted header name
 * in env, always returns the shared bucket (IP-independent).
 */
export function resolveClientKeyMaterial(
  req: Request,
  trustedHeaderName: string | undefined
): { material: string; trusted: boolean } {
  const configured = (trustedHeaderName ?? "").trim().toLowerCase();
  if (!configured) {
    return { material: SHARED_CLIENT_KEY_MATERIAL, trusted: false };
  }
  if ((SPOOFABLE_IP_HEADERS as readonly string[]).includes(configured)) {
    // Refuse known-spoofable headers even if misconfigured.
    return { material: SHARED_CLIENT_KEY_MATERIAL, trusted: false };
  }
  const raw = req.headers.get(configured)?.trim();
  if (!raw) {
    return { material: SHARED_CLIENT_KEY_MATERIAL, trusted: false };
  }
  // Single value only — reject comma lists (classic XFF smuggling shape).
  if (raw.includes(",")) {
    return { material: SHARED_CLIENT_KEY_MATERIAL, trusted: false };
  }
  return { material: raw, trusted: true };
}

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
        "authorization, apikey, content-type, x-client-info, x-turnstile-token",
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

  async function hashClientKey(raw: string): Promise<string> {
    const salt = env("DEMO_PROVISION_CLIENT_SALT") ?? "local-dev-salt";
    const material = `${salt}:${raw}`;
    if (deps.sha256Hex) return deps.sha256Hex(material);
    const bytes = new TextEncoder().encode(material);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function verifyTurnstile(token: string | undefined): Promise<boolean> {
    const secret = env("DEMO_TURNSTILE_SECRET");
    const requireFlag =
      (env("DEMO_PROVISION_REQUIRE_TURNSTILE") ?? "").toLowerCase() === "true";
    if (!secret && !requireFlag) return true;
    if (!secret || !token) return false;
    const fetchFn = deps.fetchFn ?? fetch;
    const body = new URLSearchParams({ secret, response: token });
    const res = await fetchFn(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body }
    );
    if (!res.ok) return false;
    const payload = (await res.json()) as { success?: boolean };
    return payload.success === true;
  }

  async function safeCleanupOwned(
    admin: DemoProvisionClient,
    owned: OwnedDemoIdentity | null
  ): Promise<void> {
    if (!owned) return;

    const fetched = await admin.auth.admin.getUserById(owned.userId);
    if (fetched.error || !fetched.data?.user) {
      // Cannot re-confirm — refuse delete.
      return;
    }
    const reconfirmed = confirmOwnedDemoIdentity(
      owned.email,
      owned.provisionNonce,
      fetched.data.user
    );
    if (!reconfirmed) return;

    const deleted = await admin.auth.admin.deleteUser(reconfirmed.userId);
    if (deleted.error) {
      await admin.rpc("record_demo_provision_orphan", {
        p_user_id: reconfirmed.userId,
        p_email: reconfirmed.email,
        p_nonce: reconfirmed.provisionNonce,
        p_error: deleted.error.message ?? "delete_failed",
      });
    }
  }

  async function releaseReservation(
    admin: DemoProvisionClient,
    reservationId: string | null
  ): Promise<void> {
    if (!reservationId) return;
    await admin.rpc("release_demo_provision_reservation", {
      p_reservation_id: reservationId,
    });
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: headersFor(req) });
    }
    if (req.method !== "POST") {
      return json(req, { error: "method_not_allowed" }, 405);
    }

    if ((env("DEMO_PROVISION_ENABLED") ?? "").toLowerCase() !== "true") {
      return json(req, { error: "demo_provision_disabled" }, 503);
    }

    const url = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      return json(req, { error: "misconfigured" }, 500);
    }

    let body: unknown = null;
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : null;
    } catch {
      return json(req, { error: "bad_json" }, 400);
    }

    let turnstileToken: string | undefined;
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      if (record.email != null || record.userId != null || record.user_id != null) {
        return json(req, { error: "identity_not_accepted" }, 400);
      }
      if (typeof record.turnstileToken === "string") {
        turnstileToken = record.turnstileToken;
      }
    }
    turnstileToken =
      turnstileToken ?? req.headers.get("x-turnstile-token") ?? undefined;

    if (!(await verifyTurnstile(turnstileToken))) {
      return json(req, { error: "automation_rejected" }, 403);
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { material } = resolveClientKeyMaterial(
      req,
      env("DEMO_PROVISION_TRUSTED_IP_HEADER")
    );
    const clientKey = await hashClientKey(material);
    const windowSeconds = Number(env("DEMO_PROVISION_RATE_WINDOW_SECONDS") ?? 60);
    const maxPerWindow = Number(env("DEMO_PROVISION_RATE_MAX") ?? 5);
    const globalMax = Number(env("DEMO_PROVISION_GLOBAL_MAX_ACTIVE") ?? 500);
    // Default hold covers slow Auth; renew before registry/link keeps the lease live.
    const holdSeconds = Number(env("DEMO_PROVISION_HOLD_SECONDS") ?? 180);

    const slot = await admin.rpc("claim_demo_provision_slot", {
      p_client_key: clientKey,
      p_window_seconds: windowSeconds,
      p_max_per_window: maxPerWindow,
      p_global_max_active: globalMax,
      p_hold_seconds: holdSeconds,
    });
    if (slot.error || typeof slot.data !== "string") {
      const message = slot.error?.message ?? "";
      if (message.includes("demo_rate_limited")) {
        return json(req, { error: "rate_limited" }, 429);
      }
      if (message.includes("demo_capacity_exhausted")) {
        return json(req, { error: "capacity_exhausted" }, 503);
      }
      return json(req, { error: "provision_failed" }, 500);
    }
    const reservationId = slot.data;

    const email = syntheticDemoEmail();
    const provisionNonce = deps.randomUUID();
    let owned: OwnedDemoIdentity | null = null;

    async function failProvision(): Promise<Response> {
      await safeCleanupOwned(admin, owned);
      await releaseReservation(admin, reservationId);
      return json(req, { error: "provision_failed" }, 500);
    }

    async function assertReservationHeld(): Promise<boolean> {
      const renewed = await admin.rpc("renew_demo_provision_reservation", {
        p_reservation_id: reservationId,
        p_hold_seconds: holdSeconds,
      });
      return !renewed.error;
    }

    try {
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        app_metadata: {
          account_kind: "demo",
          demo_provision_nonce: provisionNonce,
        },
        user_metadata: { display_name: "Konto demo" },
      });
      if (created.error || !created.data.user?.id) {
        return await failProvision();
      }

      const fetched = await admin.auth.admin.getUserById(created.data.user.id);
      // No fallback to createUser payload — a read error means ownership unproven.
      if (fetched.error || !fetched.data?.user) {
        return await failProvision();
      }

      owned = confirmOwnedDemoIdentity(email, provisionNonce, fetched.data.user);
      if (!owned) {
        return await failProvision();
      }

      // If the hold expired during Auth latency, refuse before registry write so
      // a concurrent provisioner that took the free slot cannot be oversubscribed.
      if (!(await assertReservationHeld())) {
        return await failProvision();
      }

      const registered = await admin.rpc("register_demo_identity", {
        p_user_id: owned.userId,
      });
      if (registered.error) {
        return await failProvision();
      }

      const verified = await admin.rpc("is_demo_account", {
        p_user_id: owned.userId,
      });
      if (verified.error || verified.data !== true) {
        return await failProvision();
      }

      if (!(await assertReservationHeld())) {
        return await failProvision();
      }

      const link = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: owned.email,
      });
      const hashedToken = link.data?.properties?.hashed_token;
      if (link.error || !hashedToken || typeof hashedToken !== "string") {
        return await failProvision();
      }

      const committed = await admin.rpc("commit_demo_provision_reservation", {
        p_reservation_id: reservationId,
        p_user_id: owned.userId,
      });
      if (committed.error) {
        // Unknown commit state — never hand out a token without a confirmed hold→commit.
        return await failProvision();
      }

      return json(req, {
        userId: owned.userId,
        email: owned.email,
        tokenHash: hashedToken,
        verifyType: "email",
      });
    } catch {
      try {
        await failProvision();
      } catch {
        // Best-effort cleanup / release.
      }
      return json(req, { error: "provision_failed" }, 500);
    }
  };
}
