/**
 * B2 open-demo-account Edge handler (prep only — do not deploy publicly yet).
 *
 * Session contract: claim → durable operation → createUser → ownership →
 * atomic register/commit → verify → generateLink → tokenHash.
 *
 * Once Auth may have been called, capacity never expires automatically.
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
    args?: Record<string, unknown>,
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
      deleteUser: (
        id: string,
      ) => Promise<{ error: { message?: string } | null }>;
      generateLink: (input: { type: "magiclink"; email: string }) => Promise<{
        data: {
          properties?: {
            hashed_token?: string | null;
            email_otp?: string | null;
          } | null;
        } | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

export type DemoProvisionClientFactory = (
  url: string,
  key: string,
  options: { auth: { persistSession: boolean; autoRefreshToken: boolean } },
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
  user: AuthUserShape | null | undefined,
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
  trustedHeaderName: string | undefined,
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
  deps: DemoProvisionDeps,
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
      "cache-control": "no-store",
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
      { method: "POST", body },
    );
    if (!res.ok) return false;
    const payload = (await res.json()) as { success?: boolean };
    return payload.success === true;
  }

  async function safeCleanupOwned(
    admin: DemoProvisionClient,
    owned: OwnedDemoIdentity,
    reservationId: string,
  ): Promise<void> {
    const fetched = await admin.auth.admin.getUserById(owned.userId);
    if (fetched.error || !fetched.data?.user) {
      throw new Error("cleanup_auth_unconfirmed");
    }
    const reconfirmed = confirmOwnedDemoIdentity(
      owned.email,
      owned.provisionNonce,
      fetched.data.user,
    );
    if (!reconfirmed || reconfirmed.userId !== owned.userId) {
      throw new Error("cleanup_ownership_mismatch");
    }

    const deleted = await admin.auth.admin.deleteUser(reconfirmed.userId);
    if (deleted.error) throw new Error("cleanup_delete_failed");
    const completed = await admin.rpc("complete_demo_provision_cleanup", {
      p_reservation_id: reservationId,
      p_user_id: owned.userId,
    });
    if (completed.error) {
      throw new Error("cleanup_resolution_unconfirmed");
    }
  }

  async function releaseReservation(
    admin: DemoProvisionClient,
    reservationId: string | null,
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
      if (
        record.email != null ||
        record.userId != null ||
        record.user_id != null
      ) {
        return json(req, { error: "identity_not_accepted" }, 400);
      }
      if (typeof record.turnstileToken === "string") {
        turnstileToken = record.turnstileToken;
      }
    }
    turnstileToken =
      turnstileToken ?? req.headers.get("x-turnstile-token") ?? undefined;

    let automationAccepted = false;
    try {
      automationAccepted = await verifyTurnstile(turnstileToken);
    } catch {
      // Transport failures must not create Auth users or leak upstream details.
    }
    if (!automationAccepted) {
      return json(req, { error: "automation_rejected" }, 403);
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { material } = resolveClientKeyMaterial(
      req,
      env("DEMO_PROVISION_TRUSTED_IP_HEADER"),
    );
    const clientKey = await hashClientKey(material);
    const windowSeconds = Number(
      env("DEMO_PROVISION_RATE_WINDOW_SECONDS") ?? 60,
    );
    const maxPerWindow = Number(env("DEMO_PROVISION_RATE_MAX") ?? 5);
    const globalMax = Number(env("DEMO_PROVISION_GLOBAL_MAX_ACTIVE") ?? 500);
    // TTL applies only before Auth starts; durable operations do not expire.
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
    let createdUserId: string | null = null;
    let operationStarted = false;

    async function failProvision(): Promise<Response> {
      let orphanKind = "unconfirmed_auth_read";
      if (owned) {
        try {
          await safeCleanupOwned(admin, owned, reservationId);
          return json(req, { error: "provision_failed" }, 500);
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "cleanup_delete_failed"
          ) {
            orphanKind = "owned_delete_failed";
          }
          // Keep the pre-Auth operation consuming capacity, even if ledger fails.
        }
      }
      if (createdUserId) {
        try {
          const recorded = await admin.rpc("record_demo_provision_orphan", {
            p_user_id: createdUserId,
            p_email: email,
            p_nonce: provisionNonce,
            p_error: "provision_cleanup_unresolved",
            p_kind: orphanKind,
          });
          if (recorded.error) throw new Error("ledger_unavailable");
        } catch {
          // The operation already durably stores email + nonce for reconciliation.
        }
      }
      // No credentials or identity metadata in logs. The durable operation ID is
      // enough for an operator to find the protected row, including unknown UID.
      if (operationStarted) {
        console.error("demo_provision_reconciliation_required", reservationId);
      } else {
        try {
          await releaseReservation(admin, reservationId);
        } catch {
          // Release can only affect pre-Auth held rows, never creating operations.
        }
      }
      return json(req, { error: "provision_failed" }, 500);
    }

    try {
      const begun = await admin.rpc("begin_demo_provision_operation", {
        p_reservation_id: reservationId,
        p_email: email,
        p_nonce: provisionNonce,
      });
      if (begun.error) return await failProvision();
      operationStarted = true;
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
      createdUserId = created.data.user.id;

      const fetched = await admin.auth.admin.getUserById(createdUserId);
      if (fetched.error || !fetched.data?.user) {
        return await failProvision();
      }

      owned =
        fetched.data.user.id === createdUserId
          ? confirmOwnedDemoIdentity(email, provisionNonce, fetched.data.user)
          : null;
      if (!owned) {
        return await failProvision();
      }

      // The DB verifies ownership again and registers + commits under one lock.
      const committed = await admin.rpc("commit_demo_provision_reservation", {
        p_reservation_id: reservationId,
        p_user_id: owned.userId,
      });
      if (committed.error) {
        return await failProvision();
      }

      const verified = await admin.rpc("is_demo_account", {
        p_user_id: owned.userId,
      });
      if (verified.error || verified.data !== true) {
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

      return json(req, {
        userId: owned.userId,
        email: owned.email,
        tokenHash: hashedToken,
        verifyType: "email",
      });
    } catch {
      return await failProvision();
    }
  };
}
