/**
 * Group invite flow: sent invitation surfaces as pending; accept clears received invite.
 */

import { expect, test, type Page } from "@playwright/test";
import { MOCK_USER, TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

const GROUP_ID = "group-owned-1";
const INVITATION_ID = "inv-pending-1";
const PEER_EMAIL = "peer@portfelik.test";

const MOCK_OWNED_GROUP = {
  id: GROUP_ID,
  name: "Rodzina",
  owner_id: TEST_USER_ID,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  expires_at: "2099-06-08T00:00:00Z",
  sent_at: "2026-06-01T00:00:00Z",
  delivery_status: "sent" as const,
  delivery_attempts: 1,
};

const PENDING_SENT_INVITE = {
  id: INVITATION_ID,
  group_id: GROUP_ID,
  group_name: "Rodzina",
  invited_user_email: PEER_EMAIL,
  invited_user_id: null,
  created_by: TEST_USER_ID,
  status: "pending",
  expires_at: "2099-06-08T00:00:00Z",
  delivery_status: "sent",
  delivery_attempts: 1,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

async function setupOwnedGroup(
  page: Page
): Promise<{ sentInvitations: (typeof PENDING_SENT_INVITE)[] }> {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const sentInvitations: (typeof PENDING_SENT_INVITE)[] = [];

  await page.route(/.*\/rest\/v1\/user_groups.*/, (route) => {
    route.fulfill({ status: 200, json: [MOCK_OWNED_GROUP] });
  });

  await page.route(/.*\/rest\/v1\/group_members.*/, (route) => {
    const url = route.request().url();
    if (url.includes(`user_id=eq.${TEST_USER_ID}`)) {
      return route.fulfill({
        status: 200,
        json: [
          {
            group_id: GROUP_ID,
            user_id: TEST_USER_ID,
            role: "owner",
            joined_at: "2026-06-01T00:00:00Z",
          },
        ],
      });
    }
    route.fulfill({ status: 200, json: [] });
  });

  await page.route(/.*\/rest\/v1\/group_invitations.*/, (route) => {
    const url = route.request().url();
    if (url.includes(`group_id=eq.${GROUP_ID}`)) {
      return route.fulfill({ status: 200, json: sentInvitations });
    }
    route.fulfill({ status: 200, json: [] });
  });

  await page.route(/.*\/functions\/v1\/send-group-invitation/, async (route) => {
    sentInvitations.push(PENDING_SENT_INVITE);
    await route.fulfill({ status: 200, json: { invitation: PENDING_SENT_INVITE } });
  });

  return { sentInvitations };
}

test.describe("group invite", () => {
  test("authenticated invite link previews and claims the group", async ({ page }) => {
    await injectFakeSession(page);
    await mockSupabaseAPI(page);
    await page.route(/.*\/rest\/v1\/rpc\/get_group_invitation_preview/, (route) => {
      route.fulfill({
        status: 200,
        json: {
          groupName: "Rodzina",
          inviterName: "Ada",
          recipientMasked: "t***@portfelik.test",
          expiresAt: "2099-06-08T00:00:00Z",
        },
      });
    });
    await page.route(/.*\/rest\/v1\/rpc\/claim_group_invitation/, (route) => {
      route.fulfill({ status: 200, json: { groupId: GROUP_ID, groupName: "Rodzina" } });
    });

    await page.goto("/invite/a".padEnd(72, "b"));
    await expect(page.getByRole("heading", { name: "Rodzina" })).toBeVisible();
    await page.getByRole("button", { name: "Dołącz do grupy" }).click();
    await expect(page).toHaveURL(new RegExp(`/settings\\?tab=groups&group=${GROUP_ID}`));
  });

  test("owner invite surfaces pending invitation in sent panel", async ({ page }) => {
    await setupOwnedGroup(page);
    await page.goto("/settings?tab=groups");

    await expect(page.getByText("Rodzina")).toBeVisible();
    await page.getByRole("button", { name: "Wysłane zaproszenia" }).click();
    await expect(page.getByText("Brak wysłanych zaproszeń")).toBeVisible();

    await page.getByRole("button", { name: "Zaproś" }).first().click();
    await page.getByLabel("Adres e-mail").fill(PEER_EMAIL);
    await page.getByLabel("Zaproś użytkownika").getByRole("button", { name: "Zaproś" }).click();

    await expect(page.getByText(PEER_EMAIL)).toBeVisible();
    await expect(page.getByText("Oczekujące")).toBeVisible();
  });

  for (const mobile of [false, true]) {
    test(`failed delivery stays visible and can be retried (${mobile ? "mobile" : "desktop"})`, async ({
      page,
    }) => {
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      const { sentInvitations } = await setupOwnedGroup(page);
      let attempts = 0;
      await page.route(/.*\/functions\/v1\/send-group-invitation/, async (route) => {
        attempts++;
        const body = route.request().postDataJSON();
        if (attempts === 2) expect(body.invitationId).toBe(INVITATION_ID);
        sentInvitations.splice(0, sentInvitations.length, {
          ...PENDING_SENT_INVITE,
          delivery_status: attempts === 1 ? "failed" : "sent",
          delivery_attempts: attempts,
        });
        await route.fulfill({
          status: 200,
          json: {
            invitation: sentInvitations[0],
            ...(attempts === 1 ? { deliveryError: "email_send_failed" } : {}),
          },
        });
      });
      await page.goto("/settings?tab=groups");
      await page.getByRole("button", { name: "Wysłane zaproszenia" }).click();
      await page.getByRole("button", { name: "Zaproś", exact: true }).first().click();
      await page.getByLabel("Adres e-mail").fill(PEER_EMAIL);
      await page.getByLabel("Zaproś użytkownika").getByRole("button", { name: "Zaproś" }).click();
      const row = page.getByRole("listitem").filter({ hasText: PEER_EMAIL });
      await expect(row).toContainText("Nie wysłano e-maila");
      await row.getByRole("button", { name: "Wyślij ponownie" }).click();
      await expect(row).not.toContainText("Nie wysłano e-maila");
      expect(attempts).toBe(2);
    });

    test(`owner removes expired and accepted history (${mobile ? "mobile" : "desktop"})`, async ({
      page,
    }) => {
      if (mobile) await page.setViewportSize({ width: 390, height: 844 });
      const { sentInvitations } = await setupOwnedGroup(page);
      sentInvitations.push(
        { ...PENDING_SENT_INVITE, expires_at: "2020-01-01T00:00:00Z" },
        {
          ...PENDING_SENT_INVITE,
          id: "accepted-1",
          invited_user_email: "accepted@example.com",
          status: "accepted",
        }
      );
      await page.route(/.*\/rest\/v1\/rpc\/delete_group_invitation/, async (route) => {
        const id = route.request().postDataJSON().p_invitation_id;
        sentInvitations.splice(
          sentInvitations.findIndex((inv) => inv.id === id),
          1
        );
        await route.fulfill({ status: 200, json: null });
      });
      await page.goto("/settings?tab=groups");
      await page.getByRole("button", { name: "Wysłane zaproszenia" }).click();
      await expect(page.getByText("Wygasłe", { exact: true })).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath("invitation-history.png"),
        fullPage: true,
      });
      for (const email of [PEER_EMAIL, "accepted@example.com"]) {
        await page.getByRole("button", { name: `Usuń zaproszenie dla ${email}` }).click();
        const confirmation = page.getByRole("alertdialog");
        await expect(confirmation).toContainText("Członkowie grupy pozostaną bez zmian");
        await confirmation.getByRole("button", { name: "Usuń", exact: true }).click();
        await expect(page.getByText(email, { exact: true })).not.toBeVisible();
      }
      await expect(page.getByText("Brak wysłanych zaproszeń")).toBeVisible();
      await expect(page.getByText("Rodzina", { exact: true })).toBeVisible();
    });
  }

  test("accepting a received invitation clears the invite banner", async ({ page }) => {
    const receivedInvite = {
      id: "inv-received-1",
      group_id: "group-invited-1",
      group_name: "Od znajomego",
      invited_user_email: MOCK_USER.email,
      invited_user_id: null,
      created_by: "00000000-0000-0000-0000-000000000002",
      status: "pending",
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
      expires_at: "2099-06-08T00:00:00Z",
      sent_at: "2026-06-01T00:00:00Z",
      delivery_status: "sent",
      delivery_attempts: 1,
    };

    let accepted = false;

    await injectFakeSession(page);
    await mockSupabaseAPI(page);

    await page.route(/.*\/rest\/v1\/user_groups.*/, (route) => {
      route.fulfill({
        status: 200,
        json: accepted
          ? [
              {
                id: receivedInvite.group_id,
                name: receivedInvite.group_name,
                owner_id: receivedInvite.created_by,
                created_at: "2026-06-01T00:00:00Z",
                updated_at: "2026-06-01T00:00:00Z",
              },
            ]
          : [],
      });
    });

    await page.route(/.*\/rest\/v1\/group_members.*/, (route) => {
      const url = route.request().url();
      if (accepted && url.includes(`user_id=eq.${TEST_USER_ID}`)) {
        return route.fulfill({
          status: 200,
          json: [
            {
              group_id: receivedInvite.group_id,
              user_id: TEST_USER_ID,
              role: "member",
              joined_at: "2026-06-01T00:00:00Z",
            },
          ],
        });
      }
      route.fulfill({ status: 200, json: [] });
    });

    await page.route(/.*\/rest\/v1\/group_invitations.*/, (route) => {
      const url = route.request().url();
      if (url.includes("invited_user_email") || url.includes("status=eq.pending")) {
        return route.fulfill({ status: 200, json: accepted ? [] : [receivedInvite] });
      }
      route.fulfill({ status: 200, json: [] });
    });

    await page.route(/.*\/rest\/v1\/rpc\/accept_invitation/, async (route) => {
      accepted = true;
      await route.fulfill({ status: 200, json: null });
    });

    await page.goto("/settings?tab=groups");

    await expect(page.getByText("Od znajomego")).toBeVisible();
    await page.getByRole("button", { name: "Akceptuj" }).click();

    await expect(page.getByRole("button", { name: "Akceptuj" })).not.toBeVisible();
    await expect(page.getByText("Od znajomego")).toBeVisible();
  });

  test("email mismatch offers switch-account recovery", async ({ page }) => {
    await injectFakeSession(page);
    await mockSupabaseAPI(page);
    await page.route(/.*\/rest\/v1\/rpc\/get_group_invitation_preview/, (route) => {
      route.fulfill({
        status: 200,
        json: {
          groupName: "Rodzina",
          inviterName: "Ada",
          recipientMasked: "p***@portfelik.test",
          expiresAt: "2099-06-08T00:00:00Z",
        },
      });
    });
    await page.route(/.*\/rest\/v1\/rpc\/claim_group_invitation/, (route) => {
      route.fulfill({
        status: 400,
        contentType: "application/json",
        json: {
          code: "P0001",
          message: "email_mismatch",
          details: null,
          hint: null,
        },
      });
    });
    await page.route(/.*\/auth\/v1\/logout.*/, (route) => {
      route.fulfill({ status: 204, body: "" });
    });

    await page.goto("/invite/a".padEnd(72, "b"));
    await expect(page.getByRole("heading", { name: "Rodzina" })).toBeVisible();
    await page.getByRole("button", { name: "Dołącz do grupy" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Zaloguj się na konto z adresem e-mail, na który wysłano zaproszenie."
    );
    await page.getByRole("button", { name: "Wyloguj i użyj właściwego konta" }).click();
    await expect(page.getByRole("button", { name: "Dołącz do grupy" })).toHaveCount(0);
  });
});
