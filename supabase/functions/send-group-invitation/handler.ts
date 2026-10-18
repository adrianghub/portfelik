type InvitationRequest = {
  action?: "invite" | "access";
  groupId?: string;
  email?: string;
  invitationId?: string;
  token?: string;
  setupPassword?: boolean;
};

type InvocationResult<T> = { data: T; error: { message?: string } | null };
type InvitationClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<InvocationResult<unknown>>;
  auth: {
    getUser: (
      token: string,
    ) => Promise<InvocationResult<{ user: { id: string } | null }>>;
    admin: {
      generateLink: (input: {
        type: "invite" | "magiclink";
        email: string;
        options: { redirectTo: string };
      }) => Promise<
        InvocationResult<{ properties?: { action_link?: string } | null } | null>
      >;
    };
  };
};
type InvitationClientFactory = (
  url: string,
  key: string,
  options: {
    auth: { persistSession: boolean };
  },
) => InvitationClient;

/** Injectable environment keeps the Edge handler testable without a Deno server. */
export function createInvitationHandler(
  env: (name: string) => string | undefined,
  createClient: InvitationClientFactory,
) {
  // Capacitor Android (androidScheme: https) sends Origin: https://localhost.
  // Always allow those hosts even when APP_ORIGINS is overridden in secrets.
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

  function escapeHtml(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character]!,
    );
  }

  async function sendEmail(input: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<boolean> {
    const apiToken = env("RESEND_API_KEY");
    const from = env("GROUP_INVITATION_FROM_EMAIL");
    if (!apiToken || !from) return false;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "content-type": "application/json",
          "user-agent": "jakstoimy-invitations/1.0",
        },
        body: JSON.stringify({
          to: [input.to],
          from: `JakStoimy <${from}>`,
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: headersFor(req) });
    }
    if (req.method !== "POST") {
      return json(req, { error: "method_not_allowed" }, 405);
    }

    let body: InvitationRequest;
    try {
      body = (await req.json()) as InvitationRequest;
    } catch {
      return json(req, { error: "invalid_json" }, 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      (body.action !== undefined &&
        body.action !== "invite" &&
        body.action !== "access") ||
      typeof body.email !== "string" ||
      (body.groupId !== undefined && typeof body.groupId !== "string") ||
      (body.invitationId !== undefined &&
        typeof body.invitationId !== "string") ||
      (body.token !== undefined && typeof body.token !== "string") ||
      (body.setupPassword !== undefined && typeof body.setupPassword !== "boolean")
    ) {
      return json(req, { error: "invalid_request" }, 400);
    }
    const email = body.email.trim().toLowerCase();
    if (!email) return json(req, { error: "invalid_request" }, 400);

    const supabaseUrl = env("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const appOrigin = env("PUBLIC_APP_ORIGIN") ?? "https://app.jakstoimy.pl";

    if (body.action === "access") {
      if (!body.token) return json(req, { error: "invalid_request" }, 400);
      const rate = await admin.rpc("record_group_invitation_access_attempt", {
        p_token: body.token,
        p_email: email,
      });
      if (rate.error) {
        return json(req, { error: "access_rate_check_failed" }, 500);
      }
      // Uniform denial: rate-limit and verify failures share the same status/body so
      // callers cannot distinguish unknown tokens from wrong-email on valid tokens.
      const denied = json(req, { error: "invitation_access_denied" }, 403);
      if (rate.data !== true) return denied;
      const verified = await admin.rpc("verify_group_invitation_recipient", {
        p_token: body.token,
        p_email: email,
      });
      if (verified.error || verified.data !== true) return denied;
      const invitationTarget = `/invite/${encodeURIComponent(body.token)}`;
      const redirectTarget = body.setupPassword
        ? `/auth/setup?redirectTo=${encodeURIComponent(invitationTarget)}`
        : invitationTarget;
      let link = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: {
          redirectTo: `${appOrigin}/auth/callback?redirectTo=${encodeURIComponent(
            redirectTarget,
          )}`,
        },
      });
      if (link.error) {
        link = await admin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: {
            redirectTo: `${appOrigin}/auth/callback?redirectTo=${encodeURIComponent(
              redirectTarget,
            )}`,
          },
        });
      }
      const actionLink = link.data?.properties?.action_link;
      if (link.error || !actionLink) {
        return json(req, { error: "auth_link_failed" }, 500);
      }
      const sent = await sendEmail({
        to: email,
        subject: "Dokończ dołączanie do grupy w JakStoimy",
        text: `Otwórz link, aby zalogować się i dołączyć do grupy: ${actionLink}`,
        html: `<p><a href="${escapeHtml(
          actionLink,
        )}">Zaloguj się i dołącz do grupy</a></p>`,
      });
      return json(req, { sent });
    }

    const authorization = req.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json(req, { error: "not_authenticated" }, 401);
    }
    if (!body.groupId) return json(req, { error: "invalid_request" }, 400);
    const { data: authData, error: authError } = await admin.auth.getUser(
      authorization.slice("Bearer ".length),
    );
    if (authError || !authData.user) {
      return json(req, { error: "not_authenticated" }, 401);
    }
    const { data, error } = await admin.rpc(
      "create_group_invitation_for_delivery",
      {
        p_group_id: body.groupId,
        p_email: email,
        p_invitation_id: body.invitationId ?? null,
        p_actor_id: authData.user.id,
      },
    );
    if (error) {
      return json(
        req,
        { error: error.message?.trim() || "invitation_create_failed" },
        400,
      );
    }

    const result = data as {
      invitation: { id: string; group_name: string };
      token: string;
    };
    // Group invitations are authorized by the owner RPC, not a tester list.
    // Google Play tester membership is unrelated to email delivery.

    const inviteUrl = `${appOrigin}/invite/${result.token}`;
    const groupName = result.invitation.group_name;
    const sent = await sendEmail({
      to: email,
      subject: `Zaproszenie do grupy ${groupName} w JakStoimy`,
      text: `Otrzymujesz zaproszenie do grupy ${groupName}. Otwórz: ${inviteUrl}\nZaproszenie wygasa za 7 dni.`,
      html: `<p>Otrzymujesz zaproszenie do grupy <strong>${escapeHtml(
        groupName,
      )}</strong>.</p><p><a href="${escapeHtml(
        inviteUrl,
      )}">Dołącz do grupy</a></p><p>Zaproszenie wygasa za 7 dni.</p>`,
    });

    await admin.rpc("record_group_invitation_delivery", {
      p_invitation_id: result.invitation.id,
      p_outcome: sent ? "sent" : "failed",
    });
    return json(req, {
      invitation: {
        ...result.invitation,
        delivery_status: sent ? "sent" : "failed",
      },
      ...(sent ? {} : { deliveryError: "email_send_failed" }),
    });
  };
}
