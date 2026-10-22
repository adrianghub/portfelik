import { createClient } from "@supabase/supabase-js";
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from "$env/static/public";
import { measuredFetch } from "$lib/performance-monitoring";
import type { Database } from "./supabase.types";
import { supabaseAuthStorage } from "$lib/auth/device-storage";

export const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
  global: { fetch: measuredFetch },
  auth: { storage: supabaseAuthStorage },
});
