import type { Page } from '@playwright/test';

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY;
const SMOKE_EMAIL = process.env.E2E_SMOKE_EMAIL;
const SMOKE_PASSWORD = process.env.E2E_SMOKE_PASSWORD;

export const SMOKE_SENTINEL = '__e2e_smoke__';

export type SmokeSession = {
  accessToken: string;
  refreshToken: string;
  userId: string;
};

function requireEnv(): {
  url: string;
  anonKey: string;
  email: string;
  password: string;
} {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SMOKE_EMAIL || !SMOKE_PASSWORD) {
    throw new Error(
      'Smoke tests require PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, E2E_SMOKE_EMAIL, E2E_SMOKE_PASSWORD env vars.',
    );
  }
  return {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    email: SMOKE_EMAIL,
    password: SMOKE_PASSWORD,
  };
}

export async function signInRealUser(): Promise<SmokeSession> {
  const { url, anonKey, email, password } = requireEnv();
  const res = await fetch(
    `${url}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Smoke auth failed (${res.status}): ${body}. Verify E2E_SMOKE_EMAIL/PASSWORD secrets and that email/password is enabled in Supabase Auth (with public sign-ups disabled).`,
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    user: { id: string };
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    userId: json.user.id,
  };
}

/**
 * Inject a real Supabase session into localStorage before page load.
 * Storage key matches what supabase-js writes for project ref `emqzcygfwcvbmhxhfkcc`.
 */
export async function injectRealSession(
  page: Page,
  session: SmokeSession,
  baseURL: string,
): Promise<void> {
  const projectRef = new URL(process.env.PUBLIC_SUPABASE_URL!).hostname.split(
    '.',
  )[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const sessionPayload = {
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: session.userId },
  };
  await page.goto(baseURL);
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: storageKey, value: sessionPayload },
  );
}

/**
 * Delete every transaction for the current user whose description starts with the smoke sentinel.
 * Idempotent — safe to call before AND after a test as a belt-and-braces cleanup.
 */
export async function cleanupSmokeData(session: SmokeSession): Promise<void> {
  const { url, anonKey } = requireEnv();
  const filter = `description=like.${encodeURIComponent(`${SMOKE_SENTINEL}%`)}&user_id=eq.${session.userId}`;
  await fetch(`${url}/rest/v1/transactions?${filter}`, {
    method: 'DELETE',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.accessToken}`,
      Prefer: 'return=minimal',
    },
  });
}
