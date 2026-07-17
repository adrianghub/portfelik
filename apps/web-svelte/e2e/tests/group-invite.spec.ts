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
});
