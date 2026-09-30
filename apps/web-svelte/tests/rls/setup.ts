import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SENTINEL = "__rls__";

type Env = {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  testPassword: string;
};

export function assertLocalSupabaseUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("RLS tests require a valid local Supabase URL.");
  }
  const loopback =
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "localhost" ||
    parsed.hostname === "[::1]";
  if (parsed.protocol !== "http:" || !loopback) {
    throw new Error(
      `Refusing to run destructive RLS fixtures against non-local Supabase target: ${parsed.origin}`
    );
  }
}

function requireEnv(): Env {
  const url = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const testPassword = process.env.RLS_TEST_PASSWORD;
  if (!url || !anonKey || !serviceRoleKey || !testPassword) {
    throw new Error(
      "RLS tests require SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and RLS_TEST_PASSWORD env vars (Supabase URL/keys via `supabase status` from repo root; password is any local string)."
    );
  }
  assertLocalSupabaseUrl(url);
  return { url, anonKey, serviceRoleKey, testPassword };
}

export function createAdminClient(): SupabaseClient {
  const { url, serviceRoleKey } = requireEnv();
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createUserClient(accessToken: string): SupabaseClient {
  const { url, anonKey } = requireEnv();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Unauthenticated PostgREST client (anon key, no session). */
export function createAnonClient(): SupabaseClient {
  const { url, anonKey } = requireEnv();
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type TestUser = {
  email: string;
  userId: string;
  accessToken: string;
  client: SupabaseClient;
};

async function findUserByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  return data.users.find((u) => u.email === email)?.id ?? null;
}

async function ensureUser(admin: SupabaseClient, email: string): Promise<string> {
  const { testPassword } = requireEnv();
  const existingId = await findUserByEmail(admin, email);
  if (existingId) {
    // Reset password in case prior run used a different one.
    await admin.auth.admin.updateUserById(existingId, { password: testPassword });
    return existingId;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: testPassword,
    email_confirm: true,
  });
  if (!error && data.user) return data.user.id;

  // Race: another concurrent setup created the user between our list and
  // create. Re-fetch and reset password.
  const refoundId = await findUserByEmail(admin, email);
  if (refoundId) {
    await admin.auth.admin.updateUserById(refoundId, { password: testPassword });
    return refoundId;
  }
  throw error ?? new Error("createUser returned no user");
}

async function signIn(email: string): Promise<string> {
  const { url, anonKey, testPassword } = requireEnv();
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: testPassword });
  if (error || !data.session) throw error ?? new Error("signIn returned no session");
  return data.session.access_token;
}

export type TestContext = {
  admin: SupabaseClient;
  userA: TestUser;
  userB: TestUser;
};

let cachedContext: TestContext | null = null;

export async function provisionTwoUsers(): Promise<TestContext> {
  if (cachedContext) return cachedContext;

  const admin = createAdminClient();
  const emailA = "rls-a@local.test";
  const emailB = "rls-b@local.test";

  const [userIdA, userIdB] = await Promise.all([
    ensureUser(admin, emailA),
    ensureUser(admin, emailB),
  ]);
  const [tokenA, tokenB] = await Promise.all([signIn(emailA), signIn(emailB)]);

  cachedContext = {
    admin,
    userA: {
      email: emailA,
      userId: userIdA,
      accessToken: tokenA,
      client: createUserClient(tokenA),
    },
    userB: {
      email: emailB,
      userId: userIdB,
      accessToken: tokenB,
      client: createUserClient(tokenB),
    },
  };
  return cachedContext;
}

/**
 * Delete every sentinel-prefixed row across all tables. Idempotent.
 * Bypasses RLS via service-role client.
 */
export async function cleanupSentinels(admin: SupabaseClient): Promise<void> {
  const pattern = `${SENTINEL}%`;
  const [plansResult, transactionsResult] = await Promise.all([
    admin.from("plans").select("id").like("name", pattern),
    admin.from("transactions").select("id").like("description", pattern),
  ]);
  if (plansResult.error) throw plansResult.error;
  if (transactionsResult.error) throw transactionsResult.error;
  const planIds = (plansResult.data ?? []).map((row) => row.id);
  const transactionIds = (transactionsResult.data ?? []).map((row) => row.id);

  // transactions cascade to transaction_import_links (FK transaction_id ON DELETE CASCADE).
  if (planIds.length > 0) {
    const { error } = await admin.from("plan_transaction_links").delete().in("plan_id", planIds);
    if (error) throw error;
  }
  if (transactionIds.length > 0) {
    const { error } = await admin
      .from("plan_transaction_links")
      .delete()
      .in("transaction_id", transactionIds);
    if (error) throw error;
  }
  const deleteTransactions = await admin.from("transactions").delete().like("description", pattern);
  if (deleteTransactions.error) throw deleteTransactions.error;
  const deletePlans = await admin.from("plans").delete().like("name", pattern);
  if (deletePlans.error) throw deletePlans.error;
  const deleteNotifications = await admin.from("notifications").delete().like("title", pattern);
  if (deleteNotifications.error) throw deleteNotifications.error;
  // Import chain: rows → sessions → bank_accounts (all RESTRICT, so order matters).
  // rows by raw_row_hash sentinel
  const deleteImportRows = await admin
    .from("transaction_import_rows")
    .delete()
    .like("raw_row_hash", `%${SENTINEL}%`);
  if (deleteImportRows.error) throw deleteImportRows.error;
  // sessions by source_file_hash sentinel
  const deleteImportSessions = await admin
    .from("transaction_import_sessions")
    .delete()
    .like("source_file_hash", `%${SENTINEL}%`);
  if (deleteImportSessions.error) throw deleteImportSessions.error;
  // bank_accounts by label sentinel
  const deleteBankAccounts = await admin.from("bank_accounts").delete().like("label", pattern);
  if (deleteBankAccounts.error) throw deleteBankAccounts.error;
  // categories cascade to categorization_rules (FK category_id ON DELETE CASCADE).
  const deleteCategories = await admin.from("categories").delete().like("name", pattern);
  if (deleteCategories.error) throw deleteCategories.error;
  // group_invitations: clean by sentinel email domain
  const deleteInvitations = await admin
    .from("group_invitations")
    .delete()
    .like("invited_user_email", "%@rls.test");
  if (deleteInvitations.error) throw deleteInvitations.error;
  // user_groups: cascades to group_members + group_invitations
  const deleteGroups = await admin.from("user_groups").delete().like("name", pattern);
  if (deleteGroups.error) throw deleteGroups.error;
}

/**
 * Expects an unauthorized select to return an empty array, NOT throw.
 * PostgREST + RLS hides rows silently rather than erroring.
 */
export function expectEmpty<T>(result: { data: T[] | null; error: unknown }): void {
  if (result.error)
    throw new Error(`Expected empty result, got error: ${JSON.stringify(result.error)}`);
  if (!Array.isArray(result.data) || result.data.length !== 0) {
    throw new Error(`Expected empty data, got: ${JSON.stringify(result.data)}`);
  }
}

/**
 * Create a pending invitation the way production does (service-role delivery
 * RPC). Authenticated clients no longer have EXECUTE on invite_user.
 */
export async function createTestInvitation(
  admin: SupabaseClient,
  groupId: string,
  email: string,
  actorId: string
): Promise<{ id: string; token: string }> {
  const { data, error } = await admin.rpc("create_group_invitation_for_delivery", {
    p_group_id: groupId,
    p_email: email,
    p_actor_id: actorId,
  });
  if (error) throw error;
  const result = data as { invitation: { id: string }; token: string };
  return { id: result.invitation.id, token: result.token };
}

/**
 * Expects an unauthorized write (insert/update/delete) to fail OR affect 0 rows.
 * PostgREST returns error for blocked INSERT (with check), or 0 affected rows
 * for blocked UPDATE/DELETE (using clause filters them out).
 */
export function expectBlockedWrite(result: {
  data: unknown;
  error: unknown;
  count?: number | null;
}): void {
  if (result.error) return; // explicit RLS denial - OK
  const data = result.data;
  if (Array.isArray(data) && data.length === 0) return; // 0 rows matched - RLS hid them
  if (data === null) return;
  if (typeof result.count === "number" && result.count === 0) return;
  throw new Error(`Expected RLS to block write, got: ${JSON.stringify(result)}`);
}
