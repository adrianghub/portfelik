import { expect, type Page, test } from "@playwright/test";
import { injectFakeSession } from "../helpers/mock-auth";
import { MOCK_CATEGORIES, MOCK_PROFILE, MOCK_USER } from "../helpers/fixtures";

const SUPABASE_URLS = [
  "https://emqzcygfwcvbmhxhfkcc.supabase.co",
  "http://127.0.0.1:54321",
  "http://localhost:54321",
] as const;

type Item = {
  id: string;
  shopping_list_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

type List = {
  id: string;
  name: string;
  status: "active" | "completed";
  user_id: string;
  group_id: string | null;
  category_id: string | null;
  total_amount: number | null;
  completed_at: string | null;
  planned_for: string;
  shopping_started_at: string | null;
  created_at: string;
  updated_at: string;
  linked_transaction_id?: string | null;
};

function isoDate(daysFromToday = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function displayDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function makeList(id: string, name: string, plannedFor = isoDate()): List {
  return {
    id,
    name,
    status: "active",
    user_id: MOCK_USER.id,
    group_id: null,
    category_id: "cat-1",
    total_amount: null,
    completed_at: null,
    planned_for: plannedFor,
    shopping_started_at: null,
    created_at: "2026-05-28T08:00:00Z",
    updated_at: "2026-05-28T08:00:00Z",
    linked_transaction_id: null,
  };
}

function item(listId: string, id: string, name: string, position: number): Item {
  return {
    id,
    shopping_list_id: listId,
    name,
    quantity: null,
    unit: null,
    category: null,
    completed: false,
    position,
    created_at: "2026-05-28T08:00:00Z",
    updated_at: "2026-05-28T08:00:00Z",
  };
}

function idFromEq(url: string): string | null {
  return decodeURIComponent(url).match(/id=eq\.([^&]+)/)?.[1] ?? null;
}

async function setupShoppingListFlowMock(page: Page) {
  const lists = new Map<string, List>();
  const items = new Map<string, Item[]>();
  let nextList = 1;
  let nextItem = 1;

  const serializeList = (list: List) => ({
    ...list,
    shopping_list_items:
      items.get(list.id)?.map((i) => ({ id: i.id, completed: i.completed })) ?? [],
    transactions: list.linked_transaction_id ? [{ id: list.linked_transaction_id }] : [],
  });
  const serializeDetail = (list: List) => ({
    ...list,
    shopping_list_items: items.get(list.id) ?? [],
    transactions: list.linked_transaction_id ? [{ id: list.linked_transaction_id }] : [],
  });

  for (const url of SUPABASE_URLS) {
    await page.route(`${url}/auth/v1/**`, (route) =>
      route.fulfill({ status: 200, json: MOCK_USER })
    );
    await page.route(`${url}/rest/v1/**`, async (route) => {
      const request = route.request();
      const requestUrl = request.url();
      const method = request.method();

      if (requestUrl.includes("/rpc/complete_shopping_list")) {
        const body = JSON.parse(request.postData() ?? "{}") as {
          p_list_id: string;
          p_total_amount: number;
          p_category_id: string;
        };
        const list = lists.get(body.p_list_id);
        if (!list)
          return route.fulfill({ status: 404, json: { message: "shopping_list_not_found" } });
        list.status = "completed";
        list.completed_at = "2026-05-28T11:00:00Z";
        list.total_amount = body.p_total_amount;
        list.category_id = body.p_category_id;
        list.linked_transaction_id = "tx-from-list";
        return route.fulfill({
          status: 200,
          json: {
            id: "tx-from-list",
            amount: body.p_total_amount,
            category_id: body.p_category_id,
          },
        });
      }

      if (requestUrl.includes("/rpc/duplicate_shopping_list")) {
        const body = JSON.parse(request.postData() ?? "{}") as { p_list_id: string };
        const source = lists.get(body.p_list_id);
        if (!source)
          return route.fulfill({ status: 404, json: { message: "shopping_list_not_found" } });
        const duplicate = makeList(`list-${nextList++}`, `${source.name} (kopia)`, isoDate());
        duplicate.category_id = source.category_id;
        lists.set(duplicate.id, duplicate);
        items.set(
          duplicate.id,
          (items.get(source.id) ?? []).map((sourceItem, index) => ({
            ...sourceItem,
            id: `item-${nextItem++}`,
            shopping_list_id: duplicate.id,
            completed: false,
            position: index + 1,
          }))
        );
        return route.fulfill({ status: 200, json: duplicate });
      }

      if (requestUrl.includes("/profiles")) {
        return route.fulfill({ status: 200, json: [MOCK_PROFILE] });
      }
      if (requestUrl.includes("/categories")) {
        return route.fulfill({ status: 200, json: MOCK_CATEGORIES });
      }
      if (requestUrl.includes("/user_groups") || requestUrl.includes("/shopping_item_categories")) {
        return route.fulfill({ status: 200, json: [] });
      }

      if (requestUrl.includes("/shopping_list_items")) {
        if (method === "POST") {
          const body = JSON.parse(request.postData() ?? "{}") as Partial<Item>;
          const listItems = items.get(body.shopping_list_id ?? "") ?? [];
          const created = item(
            body.shopping_list_id ?? "",
            `item-${nextItem++}`,
            body.name ?? "Produkt",
            listItems.length + 1
          );
          created.quantity = body.quantity ?? null;
          created.unit = body.unit ?? null;
          created.category = body.category ?? null;
          listItems.push(created);
          items.set(created.shopping_list_id, listItems);
          return route.fulfill({ status: 201, json: created });
        }
        if (method === "PATCH") {
          const id = idFromEq(requestUrl);
          const body = JSON.parse(request.postData() ?? "{}") as Partial<Item>;
          for (const listItems of items.values()) {
            const found = listItems.find((i) => i.id === id);
            if (found) {
              Object.assign(found, body, { updated_at: "2026-05-28T10:00:00Z" });
              return route.fulfill({ status: 200, json: found });
            }
          }
        }
        return route.fulfill({ status: 200, json: [] });
      }

      if (requestUrl.includes("/shopping_lists")) {
        if (method === "POST") {
          const body = JSON.parse(request.postData() ?? "{}") as Partial<List>;
          const created = makeList(`list-${nextList++}`, body.name ?? "Lista", body.planned_for);
          created.group_id = body.group_id ?? null;
          created.category_id = body.category_id ?? null;
          lists.set(created.id, created);
          items.set(created.id, []);
          return route.fulfill({ status: 201, json: created });
        }
        if (method === "PATCH") {
          const id = idFromEq(requestUrl);
          const list = id ? lists.get(id) : null;
          if (!list) return route.fulfill({ status: 404, json: {} });
          Object.assign(list, JSON.parse(request.postData() ?? "{}"), {
            updated_at: "2026-05-28T10:00:00Z",
          });
          return route.fulfill({ status: 200, json: serializeDetail(list) });
        }
        const id = idFromEq(requestUrl);
        if (id) {
          const list = lists.get(id);
          return route.fulfill({
            status: list ? 200 : 404,
            json: list ? serializeDetail(list) : {},
          });
        }
        return route.fulfill({
          status: 200,
          json: Array.from(lists.values()).map(serializeList),
        });
      }

      return route.fulfill({ status: 200, json: [] });
    });
  }
}

async function waitForToastsToSettle(page: Page) {
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 7_000 });
}

async function addPlanningCategory(page: Page, category: string) {
  await page.locator("#new-shopping-list-section").fill(category);
  await page.getByRole("button", { name: "Dodaj kategorię" }).click();
}

async function addPlanningItem(page: Page, name: string) {
  await page.getByPlaceholder("Nazwa elementu").last().fill(name);
  await page.getByRole("button", { name: "Dodaj element" }).last().click();
}

test.beforeEach(async ({ page }) => {
  await injectFakeSession(page);
  await setupShoppingListFlowMock(page);
});

test("shopping lists follow planning, shopping, archived, duplicate, and upcoming flows", async ({
  page,
}) => {
  await test.step("create list defaults to today, lands in active, and opens in planning", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/shopping-lists");

    await page.getByRole("button", { name: "Nowa lista zakupów" }).click();
    await page.locator("#sl-name").fill("Zakupy na dziś");
    await expect(page.locator("#sl-planned")).toContainText(displayDate(isoDate()));
    const createResp = page.waitForResponse(
      (r) => r.url().includes("/shopping_lists") && r.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Zapisz" }).click();
    await createResp;

    await expect(page.locator('a[href="/shopping-lists/list-1"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Na dziś" })).toBeVisible();
    await page.locator('a[href="/shopping-lists/list-1"]').click();
    await expect(page).toHaveURL(/\/shopping-lists\/list-1$/);
    await expect(page.getByText("Planowanie")).toBeVisible();
  });

  await test.step("add items in planning without checkboxes", async () => {
    await addPlanningCategory(page, "Nabiał");
    await addPlanningItem(page, "Mleko");
    await addPlanningItem(page, "Chleb");

    await expect(page.getByText("Mleko").first()).toBeVisible();
    await expect(page.getByText("Chleb").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Zaznacz" })).toHaveCount(0);
  });

  await test.step("start shopping shows checkboxes and hides edit/delete rows", async () => {
    await page.getByRole("button", { name: "Zacznij zakupy" }).click();
    await expect(page.getByText("Tryb zakupów")).toBeVisible();
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect(page.getByRole("button", { name: "Zaznacz" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Edytuj" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Usuń" })).toHaveCount(0);
  });

  await test.step("check items and add a forgotten product", async () => {
    await page.getByText("Mleko").first().click();
    await page.getByPlaceholder("Co jeszcze?").fill("Masło");
    await page.getByRole("button", { name: "Dodaj element" }).first().click();
    await expect(page.getByText("Masło").first()).toBeVisible();
    await page.getByText("Chleb").first().click();
    await page.getByText("Masło").first().click();
  });

  await test.step("complete list creates transaction and moves it to archived", async () => {
    await waitForToastsToSettle(page);
    await page.getByRole("button", { name: "Zakończ listę" }).click();
    await page.locator("#comp-amount").fill("120");
    await page.locator("#comp-cat").selectOption("cat-1");
    await page.getByRole("button", { name: "Zakończ i utwórz transakcję" }).click();

    await expect(page).toHaveURL("/shopping-lists");
    await expect(page.getByRole("heading", { name: "Zarchiwizowane" })).toBeVisible();
    // Card actions now live behind a kebab (overflow) menu.
    await expect(page.getByRole("button", { name: "Akcje listy" }).first()).toBeVisible();
  });

  await test.step("duplicate archived list creates fresh active unchecked copy", async () => {
    const dupeResponse = page.waitForResponse(
      (r) => r.url().includes("/rpc/duplicate_shopping_list") && r.status() === 200
    );
    await page.getByRole("button", { name: "Akcje listy" }).first().click();
    await page.getByRole("menuitem", { name: "Duplikuj listę" }).click();
    await dupeResponse;
    await expect(page.getByText("Lista skopiowana")).toBeVisible();
    await expect(page.getByRole("link", { name: /Zakupy na dziś \(kopia\)/ })).toBeVisible();

    await page.getByRole("link", { name: /Zakupy na dziś \(kopia\)/ }).click();
    await expect(page.getByText("Planowanie")).toBeVisible();
    await page.getByRole("button", { name: "Zacznij zakupy" }).click();
    await expect(page.getByRole("button", { name: "Zaznacz", exact: true })).toHaveCount(3);
  });

  await test.step("future list lands in upcoming but can still start shopping", async () => {
    await page.goto("/shopping-lists");
    await page.getByRole("button", { name: "Nowa lista zakupów" }).click();
    await page.locator("#sl-name").fill("Zakupy jutro");
    await page.locator("#sl-planned").click();
    await page.locator(`[data-date="${isoDate(1)}"]`).click();
    const createResp = page.waitForResponse(
      (r) => r.url().includes("/shopping_lists") && r.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Zapisz" }).click();
    await createResp;

    await expect(page.locator('a[href="/shopping-lists/list-3"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nadchodzące" })).toBeVisible();
    await page.locator('a[href="/shopping-lists/list-3"]').click();
    await expect(page.getByText("Planowanie")).toBeVisible();
    await expect(page.getByRole("button", { name: "Zacznij zakupy" })).toBeVisible();
  });
});
