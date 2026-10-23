import { supabase } from "$lib/supabase";
import type { Profile, ProfileSettings } from "$lib/types";
import { isDemoAccountUser } from "$lib/demo/identity-session";

const PROFILE_COLUMNS = "id, email, name, role, settings, created_at, updated_at";

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function updateProfile(
  userId: string,
  updates: Partial<{ name: string; settings: ProfileSettings }>
): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select(PROFILE_COLUMNS)
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function assignAdminRole(userId: string): Promise<void> {
  const { error } = await supabase.rpc("assign_admin_role", { p_user_id: userId });
  if (error) throw error;
}

/** Personalization uses the current verified demo UID, never a parked identity. */
export async function updateDemoName(value: string): Promise<Profile> {
  const name = value.trim();
  if (name.length > 30) throw new Error("demo_name_too_long");
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user || !isDemoAccountUser(data.user)) throw new Error("demo_account_required");
  return updateProfile(data.user.id, { name: name || "Konto demo" });
}

export async function revokeAdminRole(userId: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_admin_role", { p_user_id: userId });
  if (error) throw error;
}
