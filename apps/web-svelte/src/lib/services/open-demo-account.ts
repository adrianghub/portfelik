import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";
import { supabase } from "$lib/supabase";
import {
  persistPartitionedSession,
  type AccountKind,
} from "$lib/demo/identity-session";
import type { Session } from "@supabase/supabase-js";

export type OpenDemoAccountResult =
  | { ok: true; session: Session; kind: AccountKind }
  | { ok: false; error: string };

function provisionUrl(): string {
  const base = PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  return `${base}/functions/v1/open-demo-account`;
}

/**
 * Opens a dedicated demo Auth identity via Edge (local/staging when enabled).
 * Does not accept caller email/userId. Never logs tokenHash.
 */
export async function openDemoAccount(input?: {
  turnstileToken?: string;
}): Promise<OpenDemoAccountResult> {
  // Preserve a real session before overwriting the active GoTrue client.
  const current = await supabase.auth.getSession();
  if (current.data.session) {
    persistPartitionedSession(current.data.session);
  }

  let response: Response;
  try {
    response = await fetch(provisionUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: PUBLIC_SUPABASE_ANON_KEY,
        authorization: `Bearer ${PUBLIC_SUPABASE_ANON_KEY}`,
        ...(input?.turnstileToken
          ? { "x-turnstile-token": input.turnstileToken }
          : {}),
      },
      body: JSON.stringify(
        input?.turnstileToken ? { turnstileToken: input.turnstileToken } : {}
      ),
    });
  } catch {
    return { ok: false, error: "demo_provision_unavailable" };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    tokenHash?: string;
    verifyType?: string;
    userId?: string;
  };

  if (!response.ok || !payload.tokenHash) {
    return {
      ok: false,
      error: payload.error ?? "demo_provision_failed",
    };
  }

  const verified = await supabase.auth.verifyOtp({
    token_hash: payload.tokenHash,
    type: "email",
  });
  if (verified.error || !verified.data.session) {
    return { ok: false, error: "demo_session_failed" };
  }

  persistPartitionedSession(verified.data.session);
  return { ok: true, session: verified.data.session, kind: "demo" };
}

export async function switchToStoredAccount(
  kind: AccountKind
): Promise<OpenDemoAccountResult> {
  const { readPartitionedSession } = await import("$lib/demo/identity-session");
  const stored = readPartitionedSession(kind);
  if (!stored) {
    return { ok: false, error: kind === "demo" ? "demo_session_missing" : "real_session_missing" };
  }
  const current = await supabase.auth.getSession();
  if (current.data.session) {
    persistPartitionedSession(current.data.session);
  }
  const applied = await supabase.auth.setSession({
    access_token: stored.access_token,
    refresh_token: stored.refresh_token,
  });
  if (applied.error || !applied.data.session) {
    return { ok: false, error: "demo_session_failed" };
  }
  persistPartitionedSession(applied.data.session);
  return { ok: true, session: applied.data.session, kind };
}
