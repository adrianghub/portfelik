import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { createAdminClient, provisionTwoUsers, type TestContext } from "./setup";

const CAP_SECRET_NAME = "max_user_cap";
const EMAIL_PREFIX = "cap-";
const REPO_ROOT = resolve(process.cwd(), "../..");

let ctx: TestContext;

function executeLocalSql(query: string): void {
  execFileSync("supabase", ["db", "query", query, "--local", "--workdir", REPO_ROOT], {
    encoding: "utf8",
  });
}

async function deleteCapSecret(): Promise<void> {
  executeLocalSql(`delete from vault.secrets where name = '${CAP_SECRET_NAME}'`);
}

async function setCapSecret(value: string): Promise<void> {
  await deleteCapSecret();
  executeLocalSql(`select vault.create_secret('${value}', '${CAP_SECRET_NAME}')`);
}

async function deleteCapUsers(): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;

  await Promise.all(
    data.users
      .filter((user) => user.email?.startsWith(EMAIL_PREFIX))
      .map(async (user) => {
        const result = await admin.auth.admin.deleteUser(user.id);
        if (result.error) throw result.error;
      })
  );
}

async function createCapUser(label: string) {
  return ctx.admin.auth.admin.createUser({
    email: `${EMAIL_PREFIX}${label}-${crypto.randomUUID()}@local.test`,
    email_confirm: true,
  });
}

describe("Auth: max_user_cap", () => {
  beforeAll(async () => {
    await deleteCapSecret();
    ctx = await provisionTwoUsers();
  });

  beforeEach(async () => {
    await deleteCapSecret();
    await deleteCapUsers();
  });

  afterAll(async () => {
    await deleteCapSecret();
    await deleteCapUsers();
  });

  it("allows auth user creation when the Vault cap is absent", async () => {
    const result = await createCapUser("open");

    expect(result.error).toBeNull();
    expect(result.data.user?.id).toBeTruthy();
  });

  it("blocks auth user creation once the Vault cap is reached", async () => {
    const { data } = await ctx.admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    await setCapSecret(String(data.users.length));

    const result = await createCapUser("blocked");

    expect(result.data.user).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("fails closed when the configured Vault cap is invalid", async () => {
    await setCapSecret("invalid");

    const result = await createCapUser("invalid");

    expect(result.data.user).toBeNull();
    expect(result.error).not.toBeNull();
  });

  it("serializes concurrent user creation up to the configured cap", async () => {
    const { data } = await ctx.admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    await setCapSecret(String(data.users.length + 1));

    const results = await Promise.all([createCapUser("race-a"), createCapUser("race-b")]);
    const successes = results.filter((result) => !result.error);
    const capFailures = results.filter((result) => result.error);

    expect(successes).toHaveLength(1);
    expect(capFailures).toHaveLength(1);
  });
});
