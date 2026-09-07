import { supabase } from "$lib/supabase";
import type { User } from "@supabase/supabase-js";

/**
 * Validate the current user with the Auth server (not localStorage alone).
 * Prefer this for privileged UI gates; RLS still protects data.
 */
export async function requireAuthUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
