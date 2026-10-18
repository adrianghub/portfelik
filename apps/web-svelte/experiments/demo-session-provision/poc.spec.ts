/**
 * Local PoC: Admin createUser + generateLink(hashed_token) + client verifyOtp.
 * Evidence only — not a production Edge Function.
 *
 * hashed_token is a sensitive credential: never log, never put in findings JSON,
 * never put in URLs/analytics. Assertions use boolean outcomes only.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.POC_SUPABASE_URL!;
const anonKey = process.env.POC_ANON_KEY!;
const serviceKey = process.env.POC_SERVICE_KEY!;

for (const value of [url]) {
  if (!value || new URL(value).hostname !== "127.0.0.1" || new URL(value).protocol !== "http:") {
    throw new Error("Only the local loopback PoC runner may start these tests.");
  }
}

const findings: Record<string, unknown> = {
  authContract: "generateLink(magiclink).hashed_token -> verifyOtp",
  disableSignup: true,
  anonymousDisabled: true,
};

type ProvisionResult = {
  userId: string;
  email: string;
  hashedToken: string;
  verifyType: "email" | "magiclink";
  linkType: string | null;
};

const createdUserIds: string[] = [];

function adminClient(): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function anonClient(): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function syntheticDemoEmail(): string {
  // Non-routable local domain; not a public mailbox.
  return `demo+${randomUUID()}@demo.jakstoimy.local`;
}

async function provisionDemoIdentity(): Promise<ProvisionResult> {
  const admin = adminClient();
  const email = syntheticDemoEmail();
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { account_kind: "demo" },
    user_metadata: { display_name: "Konto demo" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("createUser failed");
  }
  createdUserIds.push(created.data.user.id);

  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (link.error || !link.data) {
    throw link.error ?? new Error("generateLink failed");
  }
  const hashedToken = link.data.properties?.hashed_token;
  if (!hashedToken || typeof hashedToken !== "string") {
    throw new Error("generateLink returned no hashed_token");
  }
  // Do not retain action_link (contains secrets in query) beyond this scope.
  return {
    userId: created.data.user.id,
    email,
    hashedToken,
    verifyType: "email",
    linkType: (link.data.properties as { verification_type?: string } | undefined)?.verification_type ?? null,
  };
}

async function exchangeSession(hashedToken: string, type: "email" | "magiclink") {
  return anonClient().auth.verifyOtp({ token_hash: hashedToken, type });
}

describe("demo session provision PoC (invite-only local Auth)", () => {
  beforeAll(async () => {
    // Public signup must stay denied.
    const denied = await anonClient().auth.signUp({
      email: `public-${randomUUID()}@example.test`,
      password: randomUUID(),
    });
    findings.publicSignupDenied = Boolean(denied.error) && !denied.data.user;
    expect(denied.error).toBeTruthy();
  });

  afterAll(async () => {
    const admin = adminClient();
    for (const id of createdUserIds) {
      await admin.auth.admin.deleteUser(id);
    }
    writeFileSync("/tmp/jakstoimy-demo-session-poc-findings.json", JSON.stringify(findings, null, 2));
  });

  it("issues an official session via hashed_token without returning JWTs from Admin", async () => {
    const provisioned = await provisionDemoIdentity();
    // Simulate Edge response shape: only hashed_token + type (no access/refresh).
    const edgePayload = {
      hashed_token: provisioned.hashedToken,
      type: provisioned.verifyType,
      user_id: provisioned.userId,
    };
    expect(Object.keys(edgePayload).sort()).toEqual(["hashed_token", "type", "user_id"]);

    const session = await exchangeSession(edgePayload.hashed_token, edgePayload.type);
    findings.verifyOtpTypeEmailWorks = !session.error && Boolean(session.data.session);
    findings.sessionUserMatchesCreated = session.data.session?.user.id === provisioned.userId;
    findings.linkVerificationType = provisioned.linkType;
    expect(session.error).toBeNull();
    expect(session.data.session?.access_token).toBeTruthy();
    expect(session.data.user?.id).toBe(provisioned.userId);
    expect(session.data.user?.app_metadata?.account_kind).toBe("demo");
  });

  it("rejects replay of the same hashed_token", async () => {
    const provisioned = await provisionDemoIdentity();
    const first = await exchangeSession(provisioned.hashedToken, "email");
    expect(first.error).toBeNull();
    const replay = await exchangeSession(provisioned.hashedToken, "email");
    findings.hashedTokenReplayDenied = Boolean(replay.error) && !replay.data.session;
    expect(replay.error).toBeTruthy();
    expect(replay.data.session).toBeNull();
  });

  it("does not allow provision helper to mint a token for an existing real user", async () => {
    const admin = adminClient();
    const realEmail = `real-${randomUUID()}@example.test`;
    const real = await admin.auth.admin.createUser({
      email: realEmail,
      email_confirm: true,
      password: randomUUID(),
      app_metadata: { account_kind: "real" },
    });
    expect(real.error).toBeNull();
    const realId = real.data.user!.id;
    createdUserIds.push(realId);

    // Safe provisioner contract: only createUser for new demo emails, never
    // generateLink for an arbitrary caller-supplied existing identity.
    const attackerRequestedEmail = realEmail;
    const created = await admin.auth.admin.createUser({
      email: attackerRequestedEmail,
      email_confirm: true,
      app_metadata: { account_kind: "demo" },
    });
    findings.cannotCreateDuplicateOverReal = Boolean(created.error);
    expect(created.error).toBeTruthy();

    // If a buggy Edge called generateLink(realEmail), GoTrue would issue a
    // token — document that as a required product guard (allowlist new demo only).
    const dangerous = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: realEmail,
    });
    findings.generateLinkWorksOnExistingReal = !dangerous.error && Boolean(dangerous.data.properties?.hashed_token);
    // Product rule: Edge must refuse this path. PoC proves the Auth API alone is insufficient.
    expect(dangerous.error).toBeNull();
  });

  it("keeps app_metadata.account_kind=demo after password and email update", async () => {
    const provisioned = await provisionDemoIdentity();
    const session = await exchangeSession(provisioned.hashedToken, "email");
    expect(session.error).toBeNull();
    const authed = anonClient();
    await authed.auth.setSession({
      access_token: session.data.session!.access_token,
      refresh_token: session.data.session!.refresh_token!,
    });
    const newEmail = `converted-${randomUUID()}@example.test`;
    const password = randomUUID() + "Aa1!";
    const updated = await authed.auth.updateUser({ email: newEmail, password });
    // With confirmations off locally, email may apply immediately.
    findings.clientUpdateUserAllowed = !updated.error;
    const admin = adminClient();
    const refreshed = await admin.auth.admin.getUserById(provisioned.userId);
    findings.demoClaimSurvivesClientUpdate =
      refreshed.data.user?.app_metadata?.account_kind === "demo";
    // Client must not be able to elevate via user_metadata.
    const elevate = await authed.auth.updateUser({
      data: { account_kind: "real" },
      // @ts-expect-error probing whether client can write app_metadata
      app_metadata: { account_kind: "real" },
    });
    const afterElevate = await admin.auth.admin.getUserById(provisioned.userId);
    findings.clientCannotSetAppMetadataKind =
      afterElevate.data.user?.app_metadata?.account_kind === "demo";
    expect(afterElevate.data.user?.app_metadata?.account_kind).toBe("demo");
    void elevate;
  });

  it("documents create_group still open for demo UID without server guard", async () => {
    const provisioned = await provisionDemoIdentity();
    const session = await exchangeSession(provisioned.hashedToken, "email");
    const user = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${session.data.session!.access_token}` } },
    });
    const group = await user.rpc("create_group", { p_name: `__demo_poc_${randomUUID().slice(0, 8)}` });
    findings.createGroupOpenWithoutGuard = !group.error;
    if (!group.error && group.data?.id) {
      // Cleanup group via service role if possible
      await adminClient().from("user_groups").delete().eq("id", group.data.id);
    }
    // Gap: ship blocked until create_group (and related paths) deny demo.
    expect(findings.createGroupOpenWithoutGuard).toBe(true);
  });

  it("probes recovery / password reset against synthetic demo email", async () => {
    const provisioned = await provisionDemoIdentity();
    // Establish session first so the account is confirmed.
    await exchangeSession(provisioned.hashedToken, "email");
    const reset = await anonClient().auth.resetPasswordForEmail(provisioned.email, {
      redirectTo: "http://127.0.0.1:5173/auth/callback",
    });
    findings.resetPasswordAcceptedForSyntheticEmail = !reset.error;
    // If accepted, product must disable recovery for demo or use non-recoverable identity.
  });

  it("abuse: parallel provision creates distinct UIDs (no shared session)", async () => {
    const jobs = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const provisioned = await provisionDemoIdentity();
        const session = await exchangeSession(provisioned.hashedToken, "email");
        return {
          ok: !session.error && session.data.user?.id === provisioned.userId,
          userId: provisioned.userId,
        };
      })
    );
    const ids = new Set(jobs.map((j) => j.userId));
    findings.parallelProvisionsDistinct = ids.size === jobs.length && jobs.every((j) => j.ok);
    expect(findings.parallelProvisionsDistinct).toBe(true);
  });

  it("verifyOtp with wrong type fails (contract check)", async () => {
    const provisioned = await provisionDemoIdentity();
    const wrong = await anonClient().auth.verifyOtp({
      token_hash: provisioned.hashedToken,
      type: "invite",
    });
    findings.wrongVerifyTypeDenied = Boolean(wrong.error);
    // Also try magiclink type for documentation
    const alt = await anonClient().auth.verifyOtp({
      token_hash: provisioned.hashedToken,
      type: "magiclink",
    });
    findings.magiclinkTypeWorks = !alt.error && Boolean(alt.data.session);
  });
});
