import { expect, test } from "@playwright/test";
import { formatCurrency } from "../../src/lib/utils";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";
import { MOCK_PLANS } from "../helpers/fixtures";

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

test("changes a plan icon while preserving its financial fields", async ({ page }) => {
  const plan = { ...MOCK_PLANS[0], icon: null as string | null };
  let saved: Record<string, unknown> | undefined;
  await page.route(new RegExp(`/rest/v1/plans\\?[^]*id=eq\\.${plan.id}`), async (route) => {
    if (route.request().method() === "PATCH") {
      saved = route.request().postDataJSON();
      plan.icon = saved!.icon as string | null;
    }
    return route.fulfill({ status: 200, json: plan });
  });
  await page.goto(`/plans/${plan.id}`);
  await page.getByText("Ikona planu", { exact: true }).click();
  await page.getByLabel("Ikona", { exact: true }).selectOption("plane");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByRole("button", { name: "Zapisz", exact: true })).toBeDisabled();
  expect(saved).toEqual({ icon: "plane" });
  await page.reload();
  await page.getByText("Ikona planu", { exact: true }).click();
  await expect(page.getByLabel("Ikona", { exact: true })).toHaveValue("plane");
});

test("renders sectioned hub with saving goals and debt plans", async ({ page }) => {
  await page.goto("/plans");

  await expect(page.getByRole("heading", { name: "Plany" })).toBeVisible();
  await expect(page.getByText("Tu cele oszczędnościowe i kredyty.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Cele oszczędnościowe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kredyty" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Wakacje/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Nowy samochód/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Kredyt hipoteczny/ })).toBeVisible();
  await expect(
    page.getByText(`Odłożono ${formatCurrency(0)} z ${formatCurrency(1000)}`)
  ).toBeVisible();
  await expect(
    page.getByText(`Odłożono ${formatCurrency(0)} z ${formatCurrency(60_000)}`)
  ).toBeVisible();
});

test.describe("plans mobile period visibility", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("shows the complete plan deadline without horizontal overflow", async ({ page }) => {
    await page.goto("/plans");
    await page.getByRole("link", { name: /Nowy samochód/ }).click();
    await expect(page.getByRole("button", { name: "Termin celu" })).toContainText("30.06.2027");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
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

test("save plan detail separates new payment, existing transaction and balance correction", async ({
  page,
}) => {
  let correctionBody: Record<string, unknown> | undefined;
  await page.route(/.*\/rpc\/set_save_plan_progress.*/, async (route) => {
    correctionBody = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ status: 200, json: "adjustment-1" });
  });

  await page.goto("/plans/plan-save-1");

  await expect(page.getByRole("heading", { name: "Nowy samochód" })).toBeVisible();
  await expect(
    page.getByText(`Odłożono ${formatCurrency(0)} z ${formatCurrency(60_000)}`)
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Zapisz nową wpłatę" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Powiąż istniejącą transakcję" })).toHaveAttribute(
    "href",
    "/plans/plan-save-1/settle"
  );

  await page.getByRole("button", { name: "Zapisz nową wpłatę" }).click();
  await expect(page.getByText(/Dodasz zrealizowaną transakcję/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Skoryguj stan celu" }).click();
  await expect(page.getByText(/z wszystkimi wpłatami z tego dnia/i)).toBeVisible();
  await expect(page.getByText("Stan na koniec dnia")).toBeVisible();
  await expect(page.getByText(/Korekta zmienia tylko postęp celu/)).toBeVisible();
  await page.getByLabel("Aktualnie odłożona kwota").fill("12500");
  await page.getByRole("button", { name: "Zapisz stan celu" }).click();

  await expect.poll(() => correctionBody?.p_saved_amount).toBe(12500);
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

test("creates a spend plan with a budget cap", async ({ page }) => {
  let postedBody: Record<string, unknown> | undefined;
  await page.route(/.*\/rest\/v1\/plans.*/, async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      postedBody = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({
        status: 201,
        json: {
          id: "plan-malta",
          name: postedBody.name,
          kind: "spend",
          user_id: "00000000-0000-0000-0000-000000000001",
          group_id: null,
          category_id: null,
          budget_amount: postedBody.budget_amount,
          target_amount: null,
          start_date: postedBody.start_date,
          end_date: postedBody.end_date,
          status: "active",
          created_at: "2026-10-08T10:00:00Z",
          updated_at: "2026-10-08T10:00:00Z",
        },
      });
    }
    return route.fallback();
  });

  const { startDate, endDate } = datesInCurrentMonth();
  await page.goto("/plans");
  await page.getByRole("button", { name: "Nowy plan" }).first().click();
  await page.getByRole("button", { name: "Wydatki", exact: true }).click();
  await page.getByLabel("Nazwa planu").fill("Malta i Gozo");
  await page.getByRole("button", { name: "Od", exact: true }).click();
  await page.locator(`[data-date="${startDate}"]`).click();
  await page.getByRole("button", { name: "Do", exact: true }).click();
  await page.locator(`[data-date="${endDate}"]`).click();
  await page.getByLabel("Budżet").fill("12000");
  await expect(page.getByText("To limit wydatków, nie odłożone pieniądze.")).toBeVisible();
  await page.getByRole("button", { name: "Zapisz" }).click();

  await expect
    .poll(() => postedBody)
    .toMatchObject({
      name: "Malta i Gozo",
      kind: "spend",
      budget_amount: 12000,
      target_amount: null,
      start_date: startDate,
      end_date: endDate,
    });
});

test("a spend item stays unpaid until a transaction is linked", async ({ page }) => {
  const plan = {
    id: "plan-malta",
    name: "Malta i Gozo",
    kind: "spend",
    user_id: "00000000-0000-0000-0000-000000000001",
    group_id: null,
    category_id: null,
    budget_amount: 12000,
    target_amount: null,
    start_date: "2026-10-25",
    end_date: "2026-11-07",
    status: "active",
    icon: null,
    is_demo: false,
    refinanced_from_plan_id: null,
    replaced_by_plan_id: null,
    created_at: "2026-10-08T10:00:00Z",
    updated_at: "2026-10-08T10:00:00Z",
  };
  const items: Record<string, unknown>[] = [];
  await page.route(/.*\/rest\/v1\/plans.*id=eq\.plan-malta.*/, (route) =>
    route.fulfill({ status: 200, json: plan })
  );
  await page.route(/.*\/rest\/v1\/plan_items.*/, async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      const row = {
        id: "item-apartment",
        created_at: "2026-10-08T10:00:00Z",
        updated_at: "2026-10-08T10:00:00Z",
        ...body,
      };
      items.push(row);
      return route.fulfill({ status: 201, json: row });
    }
    return route.fulfill({ status: 200, json: items });
  });

  const { endDate } = datesInCurrentMonth();
  await page.goto("/plans/plan-malta");
  await expect(page.getByRole("heading", { name: "Malta i Gozo" })).toBeVisible();
  await expect(page.getByText("To nie zmienia salda konta.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Dodaj ręcznie" })).toHaveCount(0);
  await page.getByLabel("Nazwa pozycji").fill("Apartament");
  await page.getByLabel("Kwota", { exact: true }).fill("3600");
  await page.getByRole("button", { name: "Termin płatności" }).click();
  await page.locator(`[data-date="${endDate}"]`).click();
  await page.getByRole("button", { name: "Dodaj pozycję" }).click();

  await expect
    .poll(() => items[0])
    .toMatchObject({
      plan_id: "plan-malta",
      label: "Apartament",
      amount: 3600,
      due_date: endDate,
      status: "reserved",
      payee: null,
    });
  await expect(page.getByText("Apartament")).toBeVisible();
  await expect(page.getByText(formatCurrency(3600)).first()).toBeVisible();
  await expect(page.getByText(formatCurrency(8400)).first()).toBeVisible();
});

test("debt scenarios route redirects to plan detail", async ({ page }) => {
  await page.goto("/plans/plan-debt-1/scenarios?mode=monthly&extra=500");
  await expect.poll(() => page.url()).toMatch(/\/plans\/plan-debt-1\/?$/);
  await expect(page.getByTestId("scenarios-verdict")).toHaveCount(0);
});
