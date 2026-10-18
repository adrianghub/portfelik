import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createInvitationHandler } from "../../../../supabase/functions/send-group-invitation/handler";

const authUrl = process.env.POC_AUTH_URL!;
const restUrl = process.env.POC_REST_URL!;
const database = process.env.POC_DATABASE!;
for (const url of [authUrl, restUrl]) {
  if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).protocol !== "http:")
    throw new Error("Only the disposable local PoC runner may start these tests.");
}
if (!/^jakstoimy_auth_poc_[a-f0-9]{12}$/.test(database))
  throw new Error("Invalid disposable database");
const findings: Record<string, unknown> = {};
const originalFetch = globalThis.fetch;
const localFetch: typeof fetch = (input, options) => {
  const url = String(input);
  const mapped = url.startsWith(`${authUrl}/auth/v1/`)
    ? url.replace(`${authUrl}/auth/v1`, authUrl)
    : url.startsWith(`${authUrl}/rest/v1/`)
      ? url.replace(`${authUrl}/rest/v1`, restUrl)
      : url;
  return originalFetch(mapped, options);
};
const client = (key = process.env.POC_ANON_KEY!) =>
  createClient(authUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: localFetch },
  });
const admin = client(process.env.POC_SERVICE_KEY!);
function sql(statement: string) {
  return execFileSync(
    "docker",
    [
      "--host=unix:///var/run/docker.sock",
      "exec",
      "-i",
      "supabase_db_portfelik",
      "sh",
      "-c",
      'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql "$@"',
      "poc-sql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "supabase_admin",
      "-d",
      database,
    ],
    { input: statement, encoding: "utf8" }
  ).trim();
}
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const userCount = () => Number(sql("select count(*) from auth.users;"));
const mode = (value: string) => sql(`update demo_auth_poc.policy set mode = ${quote(value)};`);
let fixtureGroupId: string;
let fixtureOwnerId: string;
function issueGrant(email: string, expired = false, invitationId?: string) {
  const nonce = randomBytes(32).toString("hex");
  const digest = createHash("sha256").update(nonce).digest("hex");
  const inviteId =
    invitationId ??
    sql(`insert into public.group_invitations(group_id,group_name,invited_user_email,created_by)
    values (${quote(fixtureGroupId)}::uuid,'PoC grants',${quote(email.toLowerCase())},${quote(fixtureOwnerId)}::uuid) returning id;`);
  sql(`insert into demo_auth_poc.grants(digest,email,invitation_id,operation,expires_at)
    values (${quote(digest)},${quote(email.toLowerCase())},${quote(inviteId)}::uuid,'create_invited_user',now() ${expired ? "-" : "+"} interval '2 minutes');`);
  return nonce;
}
const uniqueEmail = () => `poc-${randomUUID()}@example.test`;
const password = () => randomUUID();
async function raw(path: string, body: object, bearer = process.env.POC_ANON_KEY!) {
  const response = await originalFetch(authUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
function assertBlocked(result: { error: unknown; data: { user: unknown } }, before: number) {
  expect(result.error).not.toBeNull();
  expect(result.data.user).toBeNull();
  expect(userCount()).toBe(before);
}
async function newAnonymous() {
  const c = client();
  const result = await c.auth.signInAnonymously();
  expect(result.error?.message ?? null).toBeNull();
  expect(result.data.user?.is_anonymous).toBe(true);
  return { c, id: result.data.user!.id, session: result.data.session! };
}
beforeAll(async () => {
  const email = uniqueEmail();
  const pw = password();
  const owner = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  expect(owner.error?.message ?? null).toBeNull();
  fixtureOwnerId = owner.data.user!.id;
  const c = client();
  expect(
    (await c.auth.signInWithPassword({ email, password: pw })).error?.message ?? null
  ).toBeNull();
  const group = await c.rpc("create_group", { p_name: "PoC grant owner" });
  expect(group.error?.message ?? null).toBeNull();
  fixtureGroupId = group.data.id;
});
afterAll(() => {
  vi.unstubAllGlobals();
  writeFileSync("/tmp/jakstoimy-anonymous-poc-findings.json", JSON.stringify(findings, null, 2));
});

describe.sequential("LOCAL EXPERIMENT: Before User Created Hook", () => {
  it("allows genuine anonymous sessions on the unchanged financial schema", async () => {
    const result = await client().auth.signInAnonymously();
    findings.anonymousBaseline = { success: !result.error, errorCode: result.error?.code ?? null };
    // Compatibility work, if required, is confined to the disposable schema copy.
    if (result.error) {
      sql("alter table public.profiles alter column email drop not null;");
      findings.profileNullableCompatibilityRequired = true;
    }
    const a = await newAnonymous();
    const jwt = JSON.parse(
      Buffer.from(a.session.access_token.split(".")[1], "base64url").toString()
    );
    expect(jwt.role).toBe("authenticated");
    expect(jwt.is_anonymous).toBe(true);
  });

  it("blocks email/password and forged metadata, even for an invited email", async () => {
    for (const data of [
      {},
      { is_anonymous: true, provider: "anonymous", invited: true },
      {
        app_metadata: { provider: "anonymous" },
        role: "service_role",
        poc_creation_grant: "a".repeat(64),
      },
    ]) {
      const count = userCount();
      assertBlocked(
        await client().auth.signUp({
          email: uniqueEmail(),
          password: password(),
          options: { data },
        }),
        count
      );
    }
    const count = userCount();
    const result = await raw("/signup", {
      email: uniqueEmail(),
      password: password(),
      is_anonymous: true,
      app_metadata: { provider: "anonymous" },
      role: "service_role",
    });
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(userCount()).toBe(count);
  });

  it("blocks OTP user creation and direct unprivileged admin/invite endpoints", async () => {
    for (const [path, body] of [
      ["/otp", { email: uniqueEmail(), create_user: true }],
      ["/invite", { email: uniqueEmail() }],
      ["/admin/generate_link", { type: "invite", email: uniqueEmail() }],
      ["/admin/users", { email: uniqueEmail(), email_confirm: true }],
    ] as const) {
      const count = userCount();
      const result = await raw(path, body);
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(userCount()).toBe(count);
    }
  });

  it("demonstrates that anonymous-only policy also rejects the current server invitation", async () => {
    const count = userCount();
    const result = await admin.auth.admin.generateLink({ type: "invite", email: uniqueEmail() });
    expect(result.error).not.toBeNull();
    expect(userCount()).toBe(count);
    findings.strictPolicyBreaksInvitation = true;
  });

  it("rejects Google account-creation payloads at the hook, including spoofed grant metadata", () => {
    mode("grants");
    const email = uniqueEmail();
    const nonce = issueGrant(email);
    for (const metadata of [{}, { is_anonymous: true, poc_creation_grant: nonce }]) {
      // Hook contract test, not an OAuth exchange. Real provider tokens remain a separate gate.
      const event = {
        user: {
          id: randomUUID(),
          email,
          is_anonymous: false,
          app_metadata: { provider: "google", providers: ["google"] },
          user_metadata: metadata,
        },
      };
      const value = JSON.parse(
        sql(
          `set role supabase_auth_admin; select demo_auth_poc.before_user_created(${quote(JSON.stringify(event))}::jsonb);`
        )
      );
      expect(value.error.http_code).toBe(403);
    }
    findings.googleCoverage = "real Postgres hook payload contract; no Google OAuth exchange";
  });

  it("accepts only an unexpired one-use server grant; rejects guessing, wrong email and replay", async () => {
    mode("grants");
    const target = uniqueEmail();
    const nonce = issueGrant(target);
    const expiredEmail = uniqueEmail();
    for (const [email, grant] of [
      [target, randomBytes(32).toString("hex")],
      [uniqueEmail(), nonce],
      [expiredEmail, issueGrant(expiredEmail, true)],
    ]) {
      const count = userCount();
      assertBlocked(
        await client().auth.signUp({
          email,
          password: password(),
          options: { data: { poc_creation_grant: grant } },
        }),
        count
      );
    }
    const result = await admin.auth.admin.generateLink({
      type: "invite",
      email: target,
      options: { data: { poc_creation_grant: nonce } },
    });
    expect(result.error?.message ?? null).toBeNull();
    expect(
      sql(
        `select count(*) from demo_auth_poc.grants where digest = ${quote(createHash("sha256").update(nonce).digest("hex"))} and consumed_at is null;`
      )
    ).toBe("0");
    const c = client();
    const verified = await c.auth.verifyOtp({
      token_hash: result.data.properties!.hashed_token,
      type: "invite",
    });
    expect(verified.error?.message ?? null).toBeNull();
    expect((await c.auth.updateUser({ password: password() })).error?.message ?? null).toBeNull();
    const count = userCount();
    const replay = await raw("/signup", {
      email: uniqueEmail(),
      password: password(),
      data: { poc_creation_grant: nonce },
    });
    expect(replay.status).toBeGreaterThanOrEqual(400);
    expect(userCount()).toBe(count);
  });

  it("rejects a revoked or expired invitation even if its grant has not expired", async () => {
    for (const mutation of [
      "status = 'cancelled'",
      "expires_at = now() - interval '1 minute'",
      "invited_user_email = 'other@example.test'",
    ]) {
      const email = uniqueEmail();
      const nonce = issueGrant(email);
      const digest = createHash("sha256").update(nonce).digest("hex");
      sql(
        `update public.group_invitations set ${mutation} where id = (select invitation_id from demo_auth_poc.grants where digest = ${quote(digest)});`
      );
      const count = userCount();
      const result = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { data: { poc_creation_grant: nonce } },
      });
      expect(result.error).not.toBeNull();
      expect(userCount()).toBe(count);
    }
  });

  it("consumes one grant atomically under parallel account creation requests", async () => {
    const email = uniqueEmail();
    const nonce = issueGrant(email);
    const count = userCount();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        admin.auth.admin.generateLink({
          type: "invite",
          email,
          options: { data: { poc_creation_grant: nonce } },
        })
      )
    );
    expect(results.some((r) => !r.error)).toBe(true);
    expect(userCount()).toBe(count + 1);
    const digest = createHash("sha256").update(nonce).digest("hex");
    expect(
      sql(`select count(*) from demo_auth_poc.grants g join auth.users u on u.id = g.created_user_id
      where g.digest = ${quote(digest)} and g.consumed_at is not null and u.email = ${quote(email)};`)
    ).toBe("1");
    findings.parallelGrant = "8 real requests; one created Auth UID and one consumed grant";
  });

  it("cannot replay a consumed grant after user insertion fails; a fresh grant recovers the same invitation", async () => {
    const email = uniqueEmail();
    const nonce = issueGrant(email);
    const digest = createHash("sha256").update(nonce).digest("hex");
    const inviteId = sql(
      `select invitation_id from demo_auth_poc.grants where digest = ${quote(digest)};`
    );
    sql(`create function demo_auth_poc.fail_user_insert() returns trigger language plpgsql as $$
      begin if new.email = ${quote(email)} then raise exception 'intentional_after_grant_failure'; end if; return new; end; $$;
      create trigger poc_fail_after_grant before insert on auth.users for each row execute function demo_auth_poc.fail_user_insert();`);
    const count = userCount();
    try {
      const result = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { data: { poc_creation_grant: nonce } },
      });
      expect(result.error).not.toBeNull();
      expect(userCount()).toBe(count);
      expect(
        sql(
          `select (consumed_at is not null)::text from demo_auth_poc.grants where digest = ${quote(digest)};`
        )
      ).toBe("true");
    } finally {
      sql(
        "drop trigger poc_fail_after_grant on auth.users; drop function demo_auth_poc.fail_user_insert();"
      );
    }
    expect(
      (
        await admin.auth.admin.generateLink({
          type: "invite",
          email,
          options: { data: { poc_creation_grant: nonce } },
        })
      ).error
    ).not.toBeNull();
    expect(
      sql(`select status from public.group_invitations where id = ${quote(inviteId)}::uuid;`)
    ).toBe("pending");
    const retry = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { data: { poc_creation_grant: issueGrant(email, false, inviteId) } },
    });
    expect(retry.error?.message ?? null).toBeNull();
    expect(userCount()).toBe(count + 1);
    findings.grantFailureRecovery =
      "consumption and Auth insertion are separate transactions; replay denied, fresh grant for still-valid invitation succeeds";
  });

  it("preserves the verified invitation flow with a server-only grant adapter and separate claim", async () => {
    mode("grants");
    const ownerEmail = uniqueEmail();
    const ownerPassword = password();
    const owner = await admin.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
    });
    expect(owner.error?.message ?? null).toBeNull();
    const ownerClient = client();
    expect(
      (await ownerClient.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword }))
        .error?.message ?? null
    ).toBeNull();
    const group = await ownerClient.rpc("create_group", { p_name: "PoC invited group" });
    expect(group.error?.message ?? null).toBeNull();
    const email = uniqueEmail();
    const invitation = await admin.rpc("create_group_invitation_for_delivery", {
      p_group_id: group.data.id,
      p_actor_id: owner.data.user!.id,
      p_email: email,
    });
    expect(invitation.error?.message ?? null).toBeNull();
    // Having a pending invitation with the same email is deliberately insufficient.
    const count = userCount();
    assertBlocked(await client().auth.signUp({ email, password: password() }), count);
    let link = "";
    let grantsIssued = 0;
    const factory = ((url: string, key: string, options: object) => {
      const c = createClient(url, key, { ...options, global: { fetch: localFetch } });
      const generate = c.auth.admin.generateLink.bind(c.auth.admin);
      c.auth.admin.generateLink = async (params) => {
        if (params.type !== "invite") return generate(params);
        grantsIssued++;
        return generate({
          ...params,
          options: {
            ...params.options,
            data: {
              ...params.options?.data,
              poc_creation_grant: issueGrant(params.email, false, invitation.data.invitation.id),
            },
          },
        });
      };
      return c;
    }) as typeof createClient;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("https://api.resend.com/")) {
        link = JSON.parse(String(init?.body)).text.match(/https?:\/\/\S+/)?.[0] ?? "";
        return new Response("{}", { status: 200 });
      }
      return originalFetch(input, init);
    });
    try {
      const values: Record<string, string> = {
        SUPABASE_URL: authUrl,
        SUPABASE_SERVICE_ROLE_KEY: process.env.POC_SERVICE_KEY!,
        RESEND_API_KEY: "local-intercept",
        GROUP_INVITATION_FROM_EMAIL: "poc@example.test",
        PUBLIC_APP_ORIGIN: "http://127.0.0.1:5173",
      };
      const handler = createInvitationHandler((key) => values[key], factory);
      const request = (recipient: string) =>
        new Request("http://local-poc.test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "access",
            email: recipient,
            token: invitation.data.token,
            setupPassword: true,
          }),
        });
      expect((await handler(request(uniqueEmail()))).status).toBe(403);
      expect(grantsIssued).toBe(0);
      const response = await handler(request(email));
      expect(response.status).toBe(200);
      expect((await response.json()).sent).toBe(true);
      expect(grantsIssued).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
    const c = client();
    const verified = await c.auth.verifyOtp({
      token_hash: new URL(link).searchParams.get("token")!,
      type: "invite",
    });
    expect(verified.error?.message ?? null).toBeNull();
    const id = verified.data.user!.id;
    expect(
      (await c.from("profiles").update({ name: "PoC invited profile" }).eq("id", id)).error
        ?.message ?? null
    ).toBeNull();
    expect((await c.auth.updateUser({ password: password() })).error?.message ?? null).toBeNull();
    expect(
      sql(`select count(*) from public.group_members where user_id = ${quote(id)}::uuid;`)
    ).toBe("0");
    expect(
      (await c.rpc("claim_group_invitation", { p_token: invitation.data.token })).error?.message ??
        null
    ).toBeNull();
    expect(
      sql(`select count(*) from public.group_members where user_id = ${quote(id)}::uuid;`)
    ).toBe("1");
    findings.invitationGrantAdapterRequired = true;
  });

  it("retains an existing synthetic Google identity and UID while adding a password with the hook enabled", async () => {
    const email = uniqueEmail();
    const existing = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { provider: "google", providers: ["google"] },
    });
    expect(existing.error?.message ?? null).toBeNull();
    const id = existing.data.user!.id;
    const subject = "poc-google-" + id;
    sql(`delete from auth.identities where user_id = ${quote(id)}::uuid;
      insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
      values (${quote(subject)}, ${quote(id)}::uuid, jsonb_build_object('sub',${quote(subject)},'email',${quote(email)},'email_verified',true), 'google',now(),now(),now());`);
    const before = Number(sql("select count(*) from demo_auth_poc.calls;"));
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    expect(link.error?.message ?? null).toBeNull();
    const c = client();
    expect(
      (
        await c.auth.verifyOtp({
          token_hash: link.data.properties!.hashed_token,
          type: "magiclink",
        })
      ).error?.message ?? null
    ).toBeNull();
    const newPassword = password();
    expect((await c.auth.updateUser({ password: newPassword })).error?.message ?? null).toBeNull();
    expect(
      (await client().auth.signInWithPassword({ email, password: newPassword })).data.user?.id
    ).toBe(id);
    expect(
      sql(
        `select provider_id from auth.identities where user_id = ${quote(id)}::uuid and provider = 'google';`
      )
    ).toBe(subject);
    expect(Number(sql("select count(*) from demo_auth_poc.calls;"))).toBe(before);
    mode("exception");
    try {
      const resumed = client();
      const login = await resumed.auth.signInWithPassword({ email, password: newPassword });
      expect(login.error?.message ?? null).toBeNull();
      expect(login.data.user?.id).toBe(id);
      const refreshed = await resumed.auth.refreshSession();
      expect(refreshed.error?.message ?? null).toBeNull();
      expect(refreshed.data.user?.id).toBe(id);
      expect((await resumed.auth.resetPasswordForEmail(email)).error?.message ?? null).toBeNull();
      const recovery = await admin.auth.admin.generateLink({ type: "recovery", email });
      expect(recovery.error?.message ?? null).toBeNull();
      const recovering = client();
      expect(
        (
          await recovering.auth.verifyOtp({
            type: "recovery",
            token_hash: recovery.data.properties!.hashed_token,
          })
        ).error?.message ?? null
      ).toBeNull();
      expect(
        (await recovering.auth.updateUser({ password: password() })).error?.message ?? null
      ).toBeNull();
      expect(
        sql(
          `select provider_id from auth.identities where user_id = ${quote(id)}::uuid and provider = 'google';`
        )
      ).toBe(subject);
    } finally {
      mode("grants");
    }
    findings.existingGoogleIdentity =
      "synthetic local identity retained; login, refresh, recovery work with failed hook; real OAuth still required";
  });

  it("fails closed on hook exception, timeout, malformed output and missing execute privilege", async () => {
    for (const fault of ["exception", "timeout", "malformed"]) {
      mode(fault);
      const count = userCount();
      const started = Date.now();
      const result = await client().auth.signInAnonymously();
      findings[`fault_${fault}`] = {
        rejected: !!result.error,
        errorCode: result.error?.code ?? null,
        elapsedMs: Date.now() - started,
      };
      assertBlocked(result, count);
    }
    mode("grants");
    sql(
      "revoke execute on function demo_auth_poc.before_user_created(jsonb) from supabase_auth_admin;"
    );
    try {
      const count = userCount();
      assertBlocked(await client().auth.signInAnonymously(), count);
    } finally {
      sql(
        "grant execute on function demo_auth_poc.before_user_created(jsonb) to supabase_auth_admin;"
      );
    }
  });

  it("clients cannot invoke the hook or inspect/create trusted grants through the Data API", async () => {
    const a = await newAnonymous();
    expect((await a.c.schema("demo_auth_poc").from("grants").select()).error).not.toBeNull();
    expect(
      (await a.c.schema("demo_auth_poc").rpc("before_user_created", { event: {} })).error
    ).not.toBeNull();
    const permission = sql(
      "select has_schema_privilege('authenticated','demo_auth_poc','USAGE'), has_function_privilege('authenticated','demo_auth_poc.before_user_created(jsonb)','EXECUTE');"
    );
    expect(permission).toBe("f|f");
  });

  it("isolates private transactions and cash positions between two anonymous identities", async () => {
    const a = await newAnonymous();
    const b = await newAnonymous();
    const category = await a.c
      .from("categories")
      .insert({ user_id: a.id, name: "PoC private", type: "expense" })
      .select("id")
      .single();
    expect(category.error?.message ?? null).toBeNull();
    const row = {
      category_id: category.data!.id,
      user_id: a.id,
      amount: 125,
      currency: "PLN",
      date: "2026-09-01",
      type: "expense",
      status: "paid",
      description: "PoC private transaction",
    };
    const inserted = await a.c.from("transactions").insert(row).select("id").single();
    expect(inserted.error?.message ?? null).toBeNull();
    expect((await b.c.from("transactions").select("id").eq("id", inserted.data!.id)).data).toEqual(
      []
    );
    expect((await b.c.from("transactions").insert(row)).error).not.toBeNull();
    expect(
      (
        await a.c
          .from("cash_positions")
          .insert({ owner_id: a.id, opening_amount: 1000, as_of_date: "2026-09-01" })
      ).error?.message ?? null
    ).toBeNull();
    expect((await b.c.from("cash_positions").select().eq("owner_id", a.id)).data).toEqual([]);
    expect(
      (
        await b.c
          .from("cash_positions")
          .insert({ owner_id: a.id, opening_amount: 3, as_of_date: "2026-09-01" })
      ).error
    ).not.toBeNull();
    expect((await a.c.rpc("is_admin")).data).toBe(false);
    expect((await a.c.rpc("assign_admin_role", { p_user_id: a.id })).error).not.toBeNull();
    expect(
      (await a.c.from("profiles").update({ role: "admin" }).eq("id", a.id)).error
    ).not.toBeNull();
  });

  it("uses the real import commit RPC and denies another anonymous user's session", async () => {
    const a = await newAnonymous();
    const b = await newAnonymous();
    const account = await a.c
      .from("bank_accounts")
      .insert({ user_id: a.id, kind: "ing", label: "PoC" })
      .select("id")
      .single();
    expect(account.error?.message ?? null).toBeNull();
    const session = await a.c
      .from("transaction_import_sessions")
      .insert({
        user_id: a.id,
        bank_account_id: account.data!.id,
        source_file_hash: randomUUID(),
        detected_kind: "ing",
      })
      .select("id")
      .single();
    expect(session.error?.message ?? null).toBeNull();
    const row = await a.c.from("transaction_import_rows").insert({
      session_id: session.data!.id,
      row_index: 0,
      posted_at: "2026-09-02",
      amount: 42.5,
      type: "expense",
      currency: "PLN",
      description: "PoC imported expense",
      external_id: randomUUID(),
      raw_row_hash: randomUUID(),
      decision: "import",
    });
    expect(row.error?.message ?? null).toBeNull();
    expect(
      (await b.c.rpc("commit_import_session", { p_session_id: session.data!.id })).error
    ).not.toBeNull();
    const commit = await a.c.rpc("commit_import_session", { p_session_id: session.data!.id });
    expect(commit.error?.message ?? null).toBeNull();
    const tx = await a.c.from("transactions").select("amount,description").eq("user_id", a.id);
    expect(
      tx.data?.some((t) => Number(t.amount) === 42.5 && t.description === "PoC imported expense")
    ).toBe(true);
    expect((await b.c.from("transactions").select().eq("user_id", a.id)).data).toEqual([]);
  });

  it("audits the current privilege gap: anonymous users can create groups", async () => {
    const a = await newAnonymous();
    const result = await a.c.rpc("create_group", { p_name: "PoC anonymous group" });
    expect(result.error?.message ?? null).toBeNull();
    findings.anonymousCanCreateGroup = true;
    const invite = await admin.rpc("create_group_invitation_for_delivery", {
      p_group_id: result.data.id,
      p_actor_id: a.id,
      p_email: uniqueEmail(),
    });
    expect(invite.error?.message ?? null).toBeNull();
    findings.anonymousOwnerPassesInvitationDeliveryRpc = true;
  });

  it("rejects anonymous membership claims even with forged recipient metadata", async () => {
    const email = uniqueEmail();
    const invitation = await admin.rpc("create_group_invitation_for_delivery", {
      p_group_id: fixtureGroupId,
      p_actor_id: fixtureOwnerId,
      p_email: email,
    });
    expect(invitation.error?.message ?? null).toBeNull();
    const a = await newAnonymous();
    expect(
      (await a.c.auth.updateUser({ data: { email, email_verified: true, is_anonymous: false } }))
        .error?.message ?? null
    ).toBeNull();
    expect(
      (await a.c.rpc("claim_group_invitation", { p_token: invitation.data.token })).error
    ).not.toBeNull();
    expect(
      sql(`select count(*) from public.group_members where user_id = ${quote(a.id)}::uuid;`)
    ).toBe("0");
  });

  it("rejects manual Google identity linking with the current disabled linking setting", async () => {
    const a = await newAnonymous();
    const response = await originalFetch(authUrl + "/user/identities/authorize?provider=google", {
      headers: { Authorization: `Bearer ${a.session.access_token}` },
      redirect: "manual",
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    const body = await response.json();
    expect(body.error_code ?? body.code).toBe("manual_linking_disabled");
    expect((await a.c.auth.getUser()).data.user?.is_anonymous).toBe(true);
    findings.googleLinking =
      "manual linking denied by current setting; enabled linking and real OAuth unverified";
  });

  it("fails closed if the hook policy row is missing", async () => {
    sql("delete from demo_auth_poc.policy;");
    try {
      const count = userCount();
      assertBlocked(await client().auth.signInAnonymously(), count);
    } finally {
      sql("insert into demo_auth_poc.policy values ('grants');");
    }
  });

  it("audits conversion: Before User Created does not stop adding an email to an existing anonymous user", async () => {
    const a = await newAnonymous();
    const calls = Number(sql("select count(*) from demo_auth_poc.calls;"));
    const targetEmail = uniqueEmail();
    const targetPassword = password();
    const result = await a.c.auth.updateUser({ email: targetEmail, password: targetPassword });
    findings.anonymousEmailUpdate = {
      accepted: !result.error,
      errorCode: result.error?.code ?? null,
    };
    expect(Number(sql("select count(*) from demo_auth_poc.calls;"))).toBe(calls);
    expect(result.error?.message ?? null).toBeNull();
    const hash = sql(
      `select email_change_token_new from auth.users where id = ${quote(a.id)}::uuid;`
    );
    expect(hash.length).toBeGreaterThan(0);
    const verified = await a.c.auth.verifyOtp({ token_hash: hash, type: "email_change" });
    expect(verified.error?.message ?? null).toBeNull();
    const permanent = await a.c.auth.getUser();
    expect(permanent.data.user?.id).toBe(a.id);
    expect(permanent.data.user?.is_anonymous).toBe(false);
    expect(
      (await client().auth.signInWithPassword({ email: targetEmail, password: targetPassword }))
        .data.user?.id
    ).toBe(a.id);
    expect(Number(sql("select count(*) from demo_auth_poc.calls;"))).toBe(calls);
    findings.anonymousConversionCompletedWithoutInvitation = {
      sameUid: permanent.data.user?.id === a.id,
      isAnonymous: permanent.data.user?.is_anonymous,
      emailConfirmed: !!permanent.data.user?.email_confirmed_at,
    };
  });
});
