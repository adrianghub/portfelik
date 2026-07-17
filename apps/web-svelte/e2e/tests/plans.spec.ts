import { expect, test } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

/** Two ISO dates in the currently open calendar month (always on-grid). */
function datesInCurrentMonth(): { startDate: string; endDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(y, month + 1, 0).getDate();
  const startDay = Math.min(8, lastDay - 3);
  const endDay = Math.min(22, lastDay);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ym = `${y}-${pad(month + 1)}`;
  return { startDate: `${ym}-${pad(startDay)}`, endDate: `${ym}-${pad(endDay)}` };
}

test.beforeEach(async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
});

test("renders sectioned hub with saving goals and debt plans", async ({ page }) => {
  await page.goto("/plans");

  await expect(page.getByRole("heading", { name: "Plany" })).toBeVisible();
  await expect(page.getByText("Majątek netto", { exact: true })).toBeVisible();
  await expect(page.getByText("Kredyty 206 000,00 zł")).toBeVisible();
  await expect(
    page.getByText("Dodaj gotówkę i inwestycje, by zobaczyć majątek netto.")
  ).toHaveCount(0);
  await expect(page.getByText("Plany obejmują cele oszczędnościowe i kredyty.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cele oszczędnościowe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kredyty" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Wakacje/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Nowy samochód/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Kredyt hipoteczny/ })).toBeVisible();
  await expect(page.getByText("Odłożono 0,00 zł z 1000,00 zł")).toBeVisible();
  await expect(page.getByText("Odłożono 0,00 zł z 60 000,00 zł")).toBeVisible();
});

test("creates a saving goal with date period and target", async ({ page }) => {
  let postedBody: Record<string, unknown> | undefined;
  await page.route(/.*\/rest\/v1\/plans.*/, async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      postedBody = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        status: 201,
        json: {
          id: "plan-created",
          name: postedBody.name,
          kind: postedBody.kind ?? "save",
          user_id: "00000000-0000-0000-0000-000000000001",
          group_id: null,
          category_id: null,
          budget_amount: null,
          target_amount: postedBody.target_amount ?? null,
          start_date: postedBody.start_date,
          end_date: postedBody.end_date,
          created_at: "2026-06-01T10:00:00Z",
          updated_at: "2026-06-01T10:00:00Z",
        },
      });
    }
    return route.fallback();
  });

  const { startDate, endDate } = datesInCurrentMonth();

  await page.goto("/plans");
  await page.getByRole("button", { name: "Nowy plan" }).first().click();
  await page.getByLabel("Nazwa").fill("Remont kuchni");
  await page.getByRole("button", { name: "Od", exact: true }).click();
  await page.locator(`[data-date="${startDate}"]`).click();
  await page.getByRole("button", { name: "Do", exact: true }).click();
  await page.locator(`[data-date="${endDate}"]`).click();
  await page.getByLabel("Kwota celu").fill("2500");
  await page.getByRole("button", { name: "Zapisz" }).click();

  await expect
    .poll(() => postedBody)
    .toEqual({
      name: "Remont kuchni",
      kind: "save",
      start_date: startDate,
      end_date: endDate,
      budget_amount: null,
      target_amount: 2500,
      category_id: null,
      group_id: null,
      user_id: "00000000-0000-0000-0000-000000000001",
    });
});

test("save plan detail shows progress and link CTA", async ({ page }) => {
  await page.goto("/plans/plan-save-1");

  await expect(page.getByRole("heading", { name: "Nowy samochód" })).toBeVisible();
  await expect(page.getByText("Odłożono 0,00 zł z 60 000,00 zł")).toBeVisible();
  await expect(page.getByRole("link", { name: "Powiąż wpłaty" })).toHaveAttribute(
    "href",
    "/plans/plan-save-1/settle"
  );
});

test("creates a debt plan (Kredyt) with terms", async ({ page }) => {
  let rpcBody: Record<string, unknown> | undefined;

  await page.route(/.*\/rpc\/save_debt_plan.*/, async (route) => {
    rpcBody = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({
      status: 200,
      json: {
        plan: {
          id: "plan-debt-new",
          name: rpcBody.p_name,
          kind: "debt",
          status: "active",
          user_id: "00000000-0000-0000-0000-000000000001",
          group_id: null,
          category_id: null,
          budget_amount: null,
          target_amount: rpcBody.p_target_amount ?? rpcBody.p_original_amount,
          start_date: rpcBody.p_start_date,
          end_date: rpcBody.p_end_date,
          created_at: "2026-06-01T10:00:00Z",
          updated_at: "2026-06-01T10:00:00Z",
        },
        terms: {
          plan_id: "plan-debt-new",
          original_amount: rpcBody.p_original_amount,
          current_balance: rpcBody.p_current_balance,
          annual_rate: rpcBody.p_annual_rate,
          monthly_payment: rpcBody.p_monthly_payment,
          anchor_balance: rpcBody.p_current_balance,
          balance_anchor_date: "2026-06-01",
          created_at: "2026-06-01T10:00:00Z",
          updated_at: "2026-06-01T10:00:00Z",
        },
      },
    });
  });

  await page.goto("/plans");
  await page.getByRole("button", { name: "Nowy plan" }).first().click();
  await page.getByRole("button", { name: "Kredyt" }).click();
  await page.getByLabel("Nazwa").fill("Kredyt hipoteczny test");
  await page.getByLabel("Kwota kredytu").fill("400000");
  await page.getByLabel("Rata miesięczna").fill("2500");
  await page.getByLabel("Oprocentowanie (% rocznie)").fill("7.18");
  await page.getByRole("button", { name: "Zapisz" }).click();

  await expect.poll(() => rpcBody?.p_name).toBe("Kredyt hipoteczny test");
  await expect.poll(() => Number(rpcBody?.p_monthly_payment)).toBe(2500);
  await expect.poll(() => Number(rpcBody?.p_original_amount)).toBe(400000);
  await expect(page.getByText("Plan dodany")).toBeVisible();
});

test("debt plan detail shows balance hero", async ({ page }) => {
  await page.goto("/plans/plan-debt-1");

  await expect(page.getByRole("heading", { name: "Kredyt hipoteczny" })).toBeVisible();
  await expect(page.getByText("Pozostało do spłaty")).toBeVisible();
  await expect(page.locator(".text-4xl").filter({ hasText: "206" })).toBeVisible();
});

// Refinance entry UI is deferred in the product; keep RPC coverage in unit tests.
test.skip("refinances a debt plan: closes old, opens new, writes no transaction", async ({
  page,
}) => {
  let rpcBody: Record<string, unknown> | undefined;
  let transactionWritten = false;

  await page.route(/.*\/rest\/v1\/transactions.*/, async (route) => {
    if (route.request().method() === "POST") transactionWritten = true;
    return route.fallback();
  });
  // Refinance is now a single atomic RPC; assert against its one request body.
  await page.route(/.*\/rest\/v1\/rpc\/refinance_debt_plan.*/, async (route) => {
    rpcBody = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ status: 200, json: "plan-refi-new" });
  });

  await page.goto("/plans/plan-debt-1");
  await page.getByRole("button", { name: "Refinansuj kredyt" }).click();
  await page.getByLabel("Nazwa nowego kredytu").fill("Hipoteka refinansowana");
  await page.getByLabel("Kwota kredytu").fill("207000");
  await page.getByLabel("Oprocentowanie (% rocznie)").fill("5.96");
  await page.getByLabel("Rata miesięczna", { exact: true }).fill("2255.01");
  await page.getByRole("button", { name: "Otwórz nowy kredyt" }).click();

  await expect.poll(() => rpcBody?.p_old_plan_id).toBe("plan-debt-1");
  expect(rpcBody?.p_name).toBe("Hipoteka refinansowana");
  expect(Number(rpcBody?.p_target_amount)).toBe(207000);
  expect(Number(rpcBody?.p_annual_rate)).toBe(5.96);
  expect(Number(rpcBody?.p_monthly_payment)).toBe(2255.01);

  await expect.poll(() => page.url()).toContain("/plans/plan-refi-new");
  expect(transactionWritten).toBe(false);
});

test("debt scenarios page redirects/declares unavailable (no static results)", async ({ page }) => {
  await page.goto("/plans/plan-debt-1/scenarios?mode=monthly&extra=500");

  await expect(page.getByRole("heading", { name: "Nadpłata vs inwestycja" })).toBeVisible();
  await expect(page.getByTestId("scenarios-verdict")).toBeVisible();
  // The scenarios view is intentionally unavailable; ensure we do NOT ship
  // hard-coded numeric results and instead surface a safe notice with a link.
  await expect(page.getByText("Scenariusze spłaty kredytu są obecnie niedostępne")).toBeVisible();
  await expect(page.getByRole("link", { name: /Powrót do planów/ })).toBeVisible();
});
