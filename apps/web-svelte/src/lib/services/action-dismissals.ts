// Persistence for dashboard action card dismissals (see buildDashboardActions).
// Per-user, owner-only (RLS). action_key is the aggregator's stable dismissKey.
// dismissed_until: null = permanent, future timestamp = snooze.

import { supabase } from "$lib/supabase";

/**
 * Keys the user has actively hidden right now: permanent dismissals plus snoozes
 * whose dismissed_until is still in the future. Pass the returned set straight
 * into buildDashboardActions({ dismissedKeys }).
 */
export async function fetchActiveDismissedKeys(): Promise<Set<string>> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("action_dismissals")
    .select("action_key, dismissed_until")
    .or(`dismissed_until.is.null,dismissed_until.gt.${nowIso}`);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.action_key as string));
}

/**
 * Hide an action. Omit `until` for a permanent dismiss; pass a future ISO
 * timestamp to snooze (the action re-surfaces afterwards). Idempotent per key.
 */
export async function dismissAction(actionKey: string, until?: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  const { error } = await supabase.from("action_dismissals").upsert(
    {
      user_id: user.id,
      action_key: actionKey,
      dismissed_until: until ?? null,
    },
    { onConflict: "user_id,action_key" }
  );
  if (error) throw error;
}

/** Undo a dismissal (the "Cofnij" toast action). */
export async function undismissAction(actionKey: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  const { error } = await supabase
    .from("action_dismissals")
    .delete()
    .eq("user_id", user.id)
    .eq("action_key", actionKey);
  if (error) throw error;
}
