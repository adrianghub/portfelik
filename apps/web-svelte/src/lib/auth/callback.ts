import { consumeLoginRedirect, normalizeLoginRedirect } from "$lib/auth-redirect";
import { supabase } from "$lib/supabase";

/** Consume explicit credentials before considering an existing browser session. */
export async function completeAuthCallback(url: URL): Promise<string> {
  const hash = new URLSearchParams(url.hash.slice(1));
  if (url.searchParams.has("error") || hash.has("error")) throw new Error("auth_callback_failed");
  const code = url.searchParams.get("code");
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
  } else if (accessToken || refreshToken) {
    if (!accessToken || !refreshToken) throw new Error("auth_callback_incomplete");
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("auth_callback_no_user");
  const target = consumeLoginRedirect(url);
  if (hash.get("type") === "recovery" && !target.startsWith("/auth/setup?")) {
    return `/auth/setup?mode=recovery&redirectTo=${encodeURIComponent(normalizeLoginRedirect(target))}`;
  }
  return target;
}
