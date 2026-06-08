import { expect, test } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

test.beforeEach(async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
});

test("renders sectioned hub with spend, save and debt plans", async ({ page }) => {
  await page.goto("/plans");

  await expect(page.getByRole("heading", { name: "Plany" })).toBeVisible();
  await expect(page.getByText("Dodaj gotówkę i inwestycje, by zobaczyć majątek netto.")).toBeVisible();
  await expect(
    page.getByText("Plan to przyszły zamiar. Zrealizuj go transakcjami z historii.")
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wydatki · Aktywne" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cele oszczędnościowe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kredyty" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Wakacje/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Nowy samochód/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Kredyt hipoteczny/ })).toBeVisible();
  await expect(page.getByText("wydano 0,00 zł z 1000,00 zł")).toBeVisible();
  await expect(page.getByText("Odłożono 0,00 zł z 60 000,00 zł")).toBeVisible();
});

test("creates a spend plan with date period and budget", async ({ page }) => {
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
          kind: postedBody.kind ?? "spend",
          user_id: "00000000-0000-0000-0000-000000000001",
          group_id: null,
          category_id: null,
          budget_amount: postedBody.budget_amount,
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

  await page.goto("/plans");
  await page.getByRole("button", { name: "Nowy plan" }).first().click();
  await page.getByLabel("Nazwa").fill("Remont kuchni");
  await page.getByRole("button", { name: "Od", exact: true }).click();
  await page.locator('[data-date="2026-06-10"]').click();
  await page.getByRole("button", { name: "Do", exact: true }).click();
  await page.locator('[data-date="2026-06-30"]').click();
  await page.getByLabel("Ile planujesz wydać").fill("2500");
  await page.getByRole("button", { name: "Zapisz" }).click();

  await expect.poll(() => postedBody).toEqual({
    name: "Remont kuchni",
    kind: "spend",
    start_date: "2026-06-10",
    end_date: "2026-06-30",
    budget_amount: 2500,
    target_amount: null,
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
  let planBody: Record<string, unknown> | undefined;
  let debtBody: Record<string, unknown> | undefined;

  await page.route(/.*\/rest\/v1\/plans.*/, async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      planBody = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        status: 201,
        json: {
          id: "plan-debt-new",
          name: planBody.name,
          kind: planBody.kind ?? "debt",
          user_id: "00000000-0000-0000-0000-000000000001",
          group_id: null,
          category_id: null,
          budget_amount: null,
          target_amount: planBody.target_amount ?? null,
          start_date: planBody.start_date,
          end_date: planBody.end_date,
          created_at: "2026-06-01T10:00:00Z",
          updated_at: "2026-06-01T10:00:00Z",
        },
      });
    }
    return route.fallback();
  });

  await page.route(/.*\/rest\/v1\/plan_debt_terms.*/, async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      debtBody = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        status: 201,
        json: {
          plan_id: debtBody.plan_id,
          original_amount: debtBody.original_amount,
          current_balance: debtBody.current_balance,
          annual_rate: debtBody.annual_rate,
          monthly_payment: debtBody.monthly_payment,
          payment_day: null,
          anchor_transaction_id: null,
          created_at: "2026-06-01T10:00:00Z",
          updated_at: "2026-06-01T10:00:00Z",
        },
      });
    }
    return route.fallback();
  });

  await page.goto("/plans");
  await page.getByRole("button", { name: "Nowy plan" }).first().click();
  await page.getByRole("button", { name: "Kredyt" }).click();
  await page.getByLabel("Nazwa").fill("Kredyt hipoteczny test");
  await page.getByLabel("Kwota kredytu").fill("400000");
  await page.getByLabel("Rata miesięczna").fill("2500");
  await page.getByLabel("Oprocentowanie (% rocznie)").fill("7.18");
  await page.getByRole("button", { name: "Zapisz" }).click();

  await expect.poll(() => planBody?.kind).toBe("debt");
  await expect.poll(() => debtBody?.monthly_payment).toBe(2500);
  await expect(page.getByText("Plan dodany")).toBeVisible();
});

test("debt plan detail shows balance hero and scenarios link", async ({ page }) => {
  await page.goto("/plans/plan-debt-1");

  await expect(page.getByRole("heading", { name: "Kredyt hipoteczny" })).toBeVisible();
  await expect(page.getByText("Pozostało do spłaty")).toBeVisible();
  await expect(page.locator(".text-4xl").filter({ hasText: "206" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Porównaj →" })).toHaveAttribute(
    "href",
    "/plans/plan-debt-1/scenarios?extra=500"
  );
});
