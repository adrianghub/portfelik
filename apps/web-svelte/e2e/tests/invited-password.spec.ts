import { expect, test } from "@playwright/test";
import { fulfillSupabaseJson, injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";
import { MOCK_PROFILE, MOCK_USER } from "../helpers/fixtures";

for (const mobile of [false, true]) {
  test(`verified invitation sets name/password before a separate claim (${mobile ? "mobile" : "desktop"})`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await injectFakeSession(page);
    await mockSupabaseAPI(page);
    let claims = 0;
    let savedName = "";
    let passwordWrites = 0;
    const verifiedUser = { ...MOCK_USER, email_confirmed_at: "2026-01-01T00:00:00Z" };
    await page.route("**/auth/v1/user**", (route) => {
      if (route.request().method() === "PUT") {
        expect(route.request().postDataJSON()).toMatchObject({ password: "example-password-1" });
        passwordWrites++;
      }
      return route.fulfill({ status: 200, json: verifiedUser });
    });
    await page.route("**/rest/v1/profiles**", (route) => {
      if (route.request().method() === "PATCH") savedName = route.request().postDataJSON().name;
      return fulfillSupabaseJson(route, { ...MOCK_PROFILE, name: savedName || MOCK_PROFILE.name });
    });
    await page.route("**/rest/v1/rpc/get_group_invitation_preview", (route) =>
      route.fulfill({
        status: 200,
        json: {
          groupName: "Rodzina",
          inviterName: "Ada",
          recipientMasked: "t***@portfelik.test",
          expiresAt: "2099-01-01T00:00:00Z",
        },
      })
    );
    await page.route("**/rest/v1/rpc/claim_group_invitation", (route) => {
      claims++;
      return route.fulfill({ status: 200, json: { groupId: "g1", groupName: "Rodzina" } });
    });
    await page.goto("/auth/setup?redirectTo=%2Finvite%2Fverified-token");
    await page.getByLabel("Nazwa wyświetlana").fill("Ada Testowa");
    await page.getByLabel("Hasło", { exact: true }).fill("example-password-1");
    await page.getByLabel("Powtórz hasło").fill("mismatched-password");
    await page.getByRole("button", { name: "Ustaw hasło" }).click();
    await expect(page.getByRole("alert")).toContainText("Hasła muszą być takie same");
    expect(passwordWrites).toBe(0);
    await page.getByLabel("Powtórz hasło").fill("example-password-1");
    await page.getByRole("button", { name: "Ustaw hasło" }).click();
    await expect(page).toHaveURL("/invite/verified-token");
    expect(savedName).toBe("Ada Testowa");
    expect(passwordWrites).toBe(1);
    expect(claims).toBe(0);
    await page.getByRole("button", { name: "Dołącz do grupy" }).click();
    await expect(page).toHaveURL("/settings?tab=groups&group=g1");
    expect(claims).toBe(1);
  });
}

test("password reset keeps the invitation return path and uses an email link", async ({ page }) => {
  let redirect = "";
  await page.route("**/auth/v1/recover**", (route) => {
    redirect = new URL(route.request().url()).searchParams.get("redirect_to") ?? "";
    expect(route.request().postDataJSON()).toMatchObject({ email: "existing@example.test" });
    return route.fulfill({ status: 200, json: {} });
  });
  await page.goto("/login?redirectTo=%2Finvite%2Ftoken");
  await page.getByLabel("Adres e-mail").fill("existing@example.test");
  await page.getByRole("button", { name: "Nie pamiętasz hasła?" }).click();
  await expect(page.getByRole("status")).toContainText("Jeśli konto istnieje");
  const setup = new URL(new URL(redirect).searchParams.get("redirectTo")!, "https://app.test");
  expect(setup.pathname).toBe("/auth/setup");
  expect(setup.searchParams.get("mode")).toBe("recovery");
  expect(setup.searchParams.get("redirectTo")).toBe("/invite/token");
});

test("an expired explicit callback cannot fall back to an already signed-in account", async ({
  page,
}) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await page.goto("/auth/callback#error=access_denied&error_description=expired");
  await expect(page.getByRole("link", { name: "Wróć do logowania" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Nie udało się potwierdzić logowania");
  await expect(page).toHaveURL("/auth/callback");
});

test("failed recovery request never displays a delivery confirmation", async ({ page }) => {
  await page.route("**/auth/v1/recover**", (route) =>
    route.fulfill({ status: 429, json: { message: "Too many requests" } })
  );
  await page.goto("/login");
  await page.getByLabel("Adres e-mail").fill("existing@example.test");
  await page.getByRole("button", { name: "Nie pamiętasz hasła?" }).click();
  await expect(page.getByRole("alert")).toContainText("Nie udało się wysłać linku do zmiany hasła");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nie pamiętasz hasła?" })).toBeEnabled();
});

test("unverified setup session explains how to recover access without showing password fields", async ({
  page,
}) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await page.route("**/auth/v1/user**", (route) =>
    route.fulfill({ status: 200, json: { ...MOCK_USER, email_confirmed_at: null } })
  );
  await page.goto("/auth/setup?mode=recovery");
  await expect(page.getByRole("alert")).toContainText("Otwórz aktualny link z wiadomości e-mail");
  await expect(page.getByLabel("Hasło", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Dołączenie do grupy potwierdzisz osobno.", { exact: false })
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Wróć do logowania" })).toBeVisible();
});

test("invitation email confirms only a successful request and allows retry after failure", async ({
  page,
}) => {
  await page.route("**/rest/v1/rpc/get_group_invitation_preview", (route) =>
    route.fulfill({
      status: 200,
      json: {
        groupName: "Rodzina",
        inviterName: "Ada",
        recipientMasked: "t***@example.test",
        expiresAt: "2099-01-01T00:00:00Z",
      },
    })
  );
  let requests = 0;
  await page.route("**/functions/v1/send-group-invitation", (route) => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({ setupPassword: true });
    return route.fulfill(
      requests === 1
        ? { status: 429, json: { error: "access_denied" } }
        : { status: 200, json: { sent: true } }
    );
  });
  await page.goto("/invite/email-test-token");
  await page.getByLabel("Adres e-mail").fill("test@example.test");
  const send = page.getByRole("button", { name: "Wyślij link do ustawienia hasła" });
  await send.click();
  await expect(page.getByRole("alert")).toContainText(
    "Nie udało się wysłać linku. Sprawdź adres e-mail"
  );
  await expect(page.getByRole("status")).toHaveCount(0);
  await send.click();
  await expect(page.getByRole("status")).toContainText("Dołączenie do grupy potwierdzisz osobno");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("password setup refuses a demo identity even with verified synthetic email", async ({
  page,
}) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  let writes = 0;
  await page.route("**/auth/v1/user**", (route) => {
    if (route.request().method() === "PUT") writes++;
    return route.fulfill({
      status: 200,
      json: {
        ...MOCK_USER,
        email_confirmed_at: "2026-01-01T00:00:00Z",
        app_metadata: { ...MOCK_USER.app_metadata, account_kind: "demo" },
      },
    });
  });
  await page.goto("/auth/setup");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Hasło", { exact: true })).toHaveCount(0);
  expect(writes).toBe(0);
});

test("password setup refuses an identity changed after the form was opened", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  let switched = false;
  let writes = 0;
  const verified = { ...MOCK_USER, email_confirmed_at: "2026-01-01T00:00:00Z" };
  await page.route("**/auth/v1/user**", (route) => {
    if (route.request().method() === "PUT") writes++;
    return route.fulfill({
      status: 200,
      json: { ...verified, id: switched ? "00000000-0000-0000-0000-000000000099" : verified.id },
    });
  });
  await page.route("**/rest/v1/profiles**", (route) => {
    if (route.request().method() === "PATCH") writes++;
    return fulfillSupabaseJson(route, MOCK_PROFILE);
  });
  await page.goto("/auth/setup");
  await page.getByLabel("Nazwa wyświetlana").fill("Ada Testowa");
  await page.getByLabel("Hasło", { exact: true }).fill("example-password-1");
  await page.getByLabel("Powtórz hasło").fill("example-password-1");
  switched = true;
  await page.getByRole("button", { name: "Ustaw hasło" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(writes).toBe(0);
});
