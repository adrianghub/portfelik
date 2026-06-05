import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SENTINEL, cleanupSentinels, provisionTwoUsers, type TestContext } from "./setup";

describe("alerts: bank import reminders", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
  });

  beforeEach(async () => {
    await cleanupAlertRows();
    await cleanupSentinels(ctx.admin);
    await setReminder(ctx.userA.userId, false, 7);
    await setReminder(ctx.userB.userId, false, 7);
  });

  afterAll(async () => {
    await cleanupAlertRows();
    await cleanupSentinels(ctx.admin);
  });

  async function cleanupAlertRows(): Promise<void> {
    await ctx.admin.from("notifications").delete().eq("type", "bank_import_reminder");
  }

  async function setReminder(userId: string, enabled: boolean, cadenceDays: 7 | 14 | 30) {
    const { error } = await ctx.admin
      .from("profiles")
      .update({
        settings: {
          alerts: {
            bankImportReminder: {
              enabled,
              cadenceDays,
            },
          },
        },
      })
      .eq("id", userId);
    if (error) throw error;
  }

  async function seedCommittedImport(userId: string, committedAt: string): Promise<string> {
    const suffix = `${Math.random().toString(36).slice(2, 8)}`;
    const existingAcct = await ctx.admin
      .from("bank_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", "ing")
      .is("archived_at", null)
      .maybeSingle();
    if (existingAcct.error) throw existingAcct.error;

    let accountId = existingAcct.data?.id as string | undefined;
    if (!accountId) {
      const acct = await ctx.admin
        .from("bank_accounts")
        .insert({
          user_id: userId,
          kind: "ing",
          label: `${SENTINEL} import-alert-${suffix}`,
        })
        .select("id")
        .single();
      if (acct.error) throw acct.error;
      accountId = acct.data.id as string;
    }
    if (!accountId) throw new Error("failed_to_seed_bank_account");

    const sess = await ctx.admin
      .from("transaction_import_sessions")
      .insert({
        user_id: userId,
        bank_account_id: accountId,
        source_file_hash: `hash-${SENTINEL}-import-alert-${suffix}`,
        detected_kind: "ing",
        status: "committed",
        rows_total: 2,
        rows_committed: 2,
        committed_at: committedAt,
      })
      .select("id")
      .single();
    if (sess.error) throw sess.error;
    return sess.data.id as string;
  }

  async function runReminderProducer(): Promise<void> {
    const { error } = await ctx.admin.rpc("process_bank_import_reminders");
    if (error) throw error;
  }

  async function fetchReminderNotifications(userId = ctx.userA.userId) {
    const { data, error } = await ctx.admin
      .from("notifications")
      .select("id, user_id, type, data")
      .eq("user_id", userId)
      .eq("type", "bank_import_reminder")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  it("does not create reminders when the alert is disabled", async () => {
    await seedCommittedImport(ctx.userA.userId, "2026-01-01T00:00:00Z");

    await runReminderProducer();

    await expect(fetchReminderNotifications()).resolves.toHaveLength(0);
  });

  it("creates one reminder when enabled and no committed import exists", async () => {
    await setReminder(ctx.userA.userId, true, 7);

    await runReminderProducer();

    const reminders = await fetchReminderNotifications();
    expect(reminders).toHaveLength(1);
    expect(reminders[0].data).toMatchObject({
      type: "bank_import_reminder",
      cadenceDays: 7,
      latestImportSessionId: null,
      latestImportSessionKey: "none",
      latestImportCommittedAt: null,
    });
    expect((reminders[0].data as Record<string, unknown>).reminderWindowKey).toEqual(
      expect.stringMatching(/^none:7:\d+$/)
    );
  });

  it("does not create a reminder when the latest committed import is still fresh", async () => {
    await setReminder(ctx.userA.userId, true, 14);
    await seedCommittedImport(ctx.userA.userId, new Date().toISOString());

    await runReminderProducer();

    await expect(fetchReminderNotifications()).resolves.toHaveLength(0);
  });

  it("creates and dedupes a reminder when the latest committed import is older than cadence", async () => {
    await setReminder(ctx.userA.userId, true, 7);
    const sessionId = await seedCommittedImport(ctx.userA.userId, "2026-01-01T00:00:00Z");

    await runReminderProducer();
    await runReminderProducer();

    const reminders = await fetchReminderNotifications();
    expect(reminders).toHaveLength(1);
    expect(reminders[0].data).toMatchObject({
      cadenceDays: 7,
      latestImportSessionId: sessionId,
      latestImportSessionKey: sessionId,
      latestImportCommittedAt: "2026-01-01T00:00:00+00:00",
    });
    expect((reminders[0].data as Record<string, unknown>).reminderWindowKey).toEqual(
      expect.stringMatching(new RegExp(`^${sessionId}:7:\\d+$`))
    );
  });

  it("uses the latest committed import as the dedupe window", async () => {
    await setReminder(ctx.userA.userId, true, 7);
    const firstSessionId = await seedCommittedImport(ctx.userA.userId, "2026-01-01T00:00:00Z");

    await runReminderProducer();
    const secondSessionId = await seedCommittedImport(ctx.userA.userId, "2026-02-01T00:00:00Z");
    await runReminderProducer();

    const reminders = await fetchReminderNotifications();
    expect(reminders).toHaveLength(2);
    expect(reminders.map((n) => (n.data as Record<string, unknown>).latestImportSessionId)).toEqual(
      [firstSessionId, secondSessionId]
    );
  });
});
