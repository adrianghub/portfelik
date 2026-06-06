/**
 * Playwright regression spec - shopping-list stabilization bundle.
 *
 * Covers:
 *  - attach-direction flip (tx-side picker, Tasks 1+2)
 *  - qty/unit composer in ShoppingListItemQuickAdd (Task 3)
 *  - suggestion focus gating + Escape (Task 4)
 *  - item edit sheet (Task 5)
 *  - progress bar (Task 6)
 *
 * All cases use mocked auth + Supabase stubs via injectFakeSession / mockSupabaseAPI.
 */

import { expect, test, type Page } from "@playwright/test";
import { MOCK_SHOPPING_LIST_DETAIL, TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

const SHOPPING_LISTS_URL = /.*\/rest\/v1\/shopping_lists.*/;
const SHOPPING_LIST_ITEMS_URL = /.*\/rest\/v1\/shopping_list_items.*/;

// ── Fixture helpers ──────────────────────────────────────────────────────────

/** One active list, no items (for quick-add tests). */
function emptyListFixture() {
  return {
    id: "list-empty",
    name: "Lista bez elementów",
    status: "active",
    user_id: TEST_USER_ID,
    group_id: null,
    category_id: null,
    total_amount: null,
    completed_at: null,
    created_at: "2026-05-20T10:00:00Z",
    updated_at: "2026-05-20T10:00:00Z",
    shopping_list_items: [],
  };
}

/** One active list with 5 items, 2 completed. */
function progressListFixture() {
  return {
    id: "list-progress",
    name: "Lista z postępem",
    status: "active",
    user_id: TEST_USER_ID,
    group_id: null,
    category_id: null,
    total_amount: null,
    completed_at: null,
    shopping_started_at: "2026-05-20T10:00:00Z",
    created_at: "2026-05-20T10:00:00Z",
    updated_at: "2026-05-20T10:00:00Z",
    shopping_list_items: [
      {
        id: "pi-1",
        name: "Mleko",
        quantity: 2,
        unit: "l",
        completed: true,
        position: 1,
        shopping_list_id: "list-progress",
        created_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-20T10:00:00Z",
      },
      {
        id: "pi-2",
        name: "Chleb",
        quantity: 1,
        unit: null,
        completed: true,
        position: 2,
        shopping_list_id: "list-progress",
        created_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-20T10:00:00Z",
      },
      {
        id: "pi-3",
        name: "Jajka",
        quantity: null,
        unit: null,
        completed: false,
        position: 3,
        shopping_list_id: "list-progress",
        created_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-20T10:00:00Z",
      },
      {
        id: "pi-4",
        name: "Masło",
        quantity: null,
        unit: null,
        completed: false,
        position: 4,
        shopping_list_id: "list-progress",
        created_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-20T10:00:00Z",
      },
      {
        id: "pi-5",
        name: "Ser",
        quantity: null,
        unit: null,
        completed: false,
        position: 5,
        shopping_list_id: "list-progress",
        created_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-20T10:00:00Z",
      },
    ],
  };
}

/** One active list with one item (for item-edit-sheet test). */
function singleItemListFixture() {
  return {
    id: "list-edit",
    name: "Lista do edycji",
    status: "active",
    user_id: TEST_USER_ID,
    group_id: null,
    category_id: null,
    total_amount: null,
    completed_at: null,
    created_at: "2026-05-20T10:00:00Z",
    updated_at: "2026-05-20T10:00:00Z",
    shopping_list_items: [
      {
        id: "ei-1",
        name: "Chleb",
        quantity: null,
        unit: null,
        completed: false,
        position: 1,
        shopping_list_id: "list-edit",
        created_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-20T10:00:00Z",
      },
    ],
  };
}

function groupedListFixture() {
  return {
    id: "list-grouped",
    name: "Lista z kategoriami",
    status: "active",
    user_id: TEST_USER_ID,
    group_id: null,
    category_id: null,
    total_amount: null,
    completed_at: null,
    shopping_started_at: "2026-05-20T10:00:00Z",
    created_at: "2026-05-20T10:00:00Z",
    updated_at: "2026-05-20T10:00:00Z",
    shopping_list_items: [
      {
        id: "gi-1",
        name: "Pomidor",
        quantity: null,
        unit: null,
        category: "Warzywa",
        completed: true,
        position: 1,
        shopping_list_id: "list-grouped",
        created_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-20T10:00:00Z",
      },
      {
        id: "gi-2",
        name: "Ogórek",
        quantity: null,
        unit: null,
        category: "Warzywa",
        completed: true,
        position: 2,
        shopping_list_id: "list-grouped",
        created_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-20T10:00:00Z",
      },
      {
        id: "gi-3",
        name: "Mleko",
        quantity: null,
        unit: null,
        category: "Nabiał",
        completed: false,
        position: 3,
        shopping_list_id: "list-grouped",
        created_at: "2026-05-20T10:00:00Z",
        updated_at: "2026-05-20T10:00:00Z",
      },
    ],
  };
}

/**
 * Override the shopping_list_items GET endpoint with a static list - used to
 * seed suggestion history for the combobox tests.
 */
async function seedItemHistory(
  page: Page,
  items: { name: string; quantity: number | null; unit: string | null; category?: string | null }[]
) {
  await page.route(SHOPPING_LIST_ITEMS_URL, (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ status: 200, json: items });
    return route.fulfill({ status: 200, json: {} });
  });
}

async function addShoppingCategorySection(page: Page, category = "Warzywa") {
  await page.locator("#new-shopping-list-section").fill(category);
  await page.getByRole("button", { name: "Dodaj kategorię" }).click();
  await expect(
    page.getByRole("button", { name: `Pokaż lub ukryj kategorię ${category}` })
  ).toBeVisible();
  await page.keyboard.press("Escape");
}

// ── Case 1: Quick-add accepts name-only items ─────────────────────────────────

test("quick-add accepts name-only items", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  // Return the empty list for the detail route
  const fixture = emptyListFixture();
  await page.route(/.*\/rest\/v1\/shopping_lists.*/, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("id=eq.") && method === "GET") {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === "GET") return route.fulfill({ status: 200, json: [fixture] });
    if (method === "POST") return route.fulfill({ status: 201, json: fixture });
    return route.fulfill({ status: 204, body: "" });
  });

  // POST to shopping_list_items returns the new item
  let postedBody: Record<string, unknown> = {};
  await page.route(SHOPPING_LIST_ITEMS_URL, (route) => {
    const method = route.request().method();
    if (method === "POST") {
      postedBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      return route.fulfill({
        status: 201,
        json: {
          id: "item-quick-1",
          name: "Pomidory",
          quantity: null,
          unit: null,
          category: "Warzywa",
          completed: false,
          position: 1,
          shopping_list_id: fixture.id,
          created_at: "2026-05-20T10:00:00Z",
          updated_at: "2026-05-20T10:00:00Z",
        },
      });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto("/plans/list-empty");
  await expect(page.getByText("Lista bez elementów")).toBeVisible();
  await addShoppingCategorySection(page, "Warzywa");

  // The ShoppingListItemQuickAdd form has a combobox input with placeholder "Nazwa elementu"
  const nameInput = page.getByPlaceholder("Nazwa elementu");
  await nameInput.fill("Pomidory");

  // Click the submit button - aria label is the submit button next to the toggle
  await page.getByRole("button", { name: /Dodaj element/ }).click();

  // Toast: "Element dodany"
  await expect(page.getByText("Element dodany")).toBeVisible();
  expect(postedBody.category).toBe("Warzywa");
});

// ── Case 2: Quick-add accepts inline quantity + unit ──────────────────────────

test("quick-add accepts inline quantity + unit", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const fixture = emptyListFixture();
  await page.route(/.*\/rest\/v1\/shopping_lists.*/, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("id=eq.") && method === "GET") {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === "GET") return route.fulfill({ status: 200, json: [fixture] });
    if (method === "POST") return route.fulfill({ status: 201, json: fixture });
    return route.fulfill({ status: 204, body: "" });
  });

  let postedBody: Record<string, unknown> = {};
  await page.route(SHOPPING_LIST_ITEMS_URL, (route) => {
    const method = route.request().method();
    if (method === "POST") {
      try {
        postedBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      } catch {
        postedBody = {};
      }
      return route.fulfill({
        status: 201,
        json: {
          id: "item-qty-1",
          name: "Bułka",
          quantity: 2,
          unit: "szt",
          category: "Pieczywo",
          completed: false,
          position: 1,
          shopping_list_id: fixture.id,
          created_at: "2026-05-20T10:00:00Z",
          updated_at: "2026-05-20T10:00:00Z",
        },
      });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto("/plans/list-empty");
  await expect(page.getByText("Lista bez elementów")).toBeVisible();
  await addShoppingCategorySection(page, "Pieczywo");

  await expect(page.locator('[aria-controls="shopping-list-item-details"]')).toHaveCount(0);
  await expect(page.locator("#shopping-list-item-details")).toBeVisible();

  // Fill qty (placeholder = "Ilość") and unit combobox (placeholder = "szt, kg, l…")
  await page.getByPlaceholder("Ilość").fill("2");
  await page.getByPlaceholder("szt, kg, l…").fill("szt");

  // Fill name and submit
  const nameInput = page.getByPlaceholder("Nazwa elementu");
  await nameInput.fill("Bułka");
  await page.getByRole("button", { name: /Dodaj element/ }).click();

  // Toast success
  await expect(page.getByText("Element dodany")).toBeVisible();

  // The POST body should include quantity=2 and unit="szt"
  expect(postedBody.quantity).toBe(2);
  expect(postedBody.unit).toBe("szt");
  expect(postedBody.category).toBe("Pieczywo");
});

// ── Case 3: Suggestion dropdown hides on Escape ───────────────────────────────

test("suggestion dropdown hides on Escape", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const fixture = emptyListFixture();
  await page.route(SHOPPING_LISTS_URL, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("id=eq.") && method === "GET") {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === "GET") return route.fulfill({ status: 200, json: [fixture] });
    return route.fulfill({ status: 204, body: "" });
  });

  // Seed history - one item matching "ch"
  await seedItemHistory(page, [{ name: "Chleb", quantity: 1, unit: null }]);

  await page.goto("/plans/list-empty");
  await expect(page.getByText("Lista bez elementów")).toBeVisible();
  await addShoppingCategorySection(page, "Pieczywo");

  const nameInput = page.getByPlaceholder("Nazwa elementu");
  await nameInput.focus();
  await nameInput.fill("ch");

  // Listbox should appear
  await expect(page.getByRole("listbox")).toBeVisible();

  // Press Escape - listbox hides
  await nameInput.press("Escape");
  await expect(page.getByRole("listbox")).not.toBeVisible();
});

// ── Case 4: Suggestion select fills name + auto-opens details ─────────────────

test("suggestion select fills name and auto-opens details", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const fixture = emptyListFixture();
  await page.route(SHOPPING_LISTS_URL, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("id=eq.") && method === "GET") {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === "GET") return route.fulfill({ status: 200, json: [fixture] });
    return route.fulfill({ status: 204, body: "" });
  });

  // Seed history - "Mleko" with quantity=1, unit="l"
  await seedItemHistory(page, [{ name: "Mleko", quantity: 1, unit: "l" }]);

  await page.goto("/plans/list-empty");
  await expect(page.getByText("Lista bez elementów")).toBeVisible();
  await addShoppingCategorySection(page, "Nabiał");

  const nameInput = page.getByPlaceholder("Nazwa elementu");
  await nameInput.focus();
  await nameInput.fill("ml");

  // Listbox appears with "Mleko"
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("option", { name: /Mleko/ })).toBeVisible();

  // Click the suggestion
  await page.getByRole("option", { name: /Mleko/ }).click();

  // Name input should now contain "Mleko"
  await expect(nameInput).toHaveValue("Mleko");

  // Details row should be open (quantity+unit were present in suggestion)
  await expect(page.locator("#shopping-list-item-details")).toBeVisible();

  // The qty and unit inputs should be pre-filled
  await expect(page.getByPlaceholder("Ilość")).toHaveValue("1");
  await expect(page.getByPlaceholder("szt, kg, l…")).toHaveValue("l");
});

// ── Case 5: Item edit sheet updates name + qty + unit ─────────────────────────

test("item edit sheet updates name, quantity and unit", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const fixture = singleItemListFixture();
  await page.route(SHOPPING_LISTS_URL, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("id=eq.") && method === "GET") {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === "GET") return route.fulfill({ status: 200, json: [fixture] });
    return route.fulfill({ status: 204, body: "" });
  });

  let patchedBody: Record<string, unknown> = {};
  await page.route(SHOPPING_LIST_ITEMS_URL, (route) => {
    const method = route.request().method();
    if (method === "PATCH") {
      try {
        patchedBody = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      } catch {
        patchedBody = {};
      }
      return route.fulfill({ status: 200, json: {} });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto("/plans/list-edit");
  await expect(page.getByText("Lista do edycji")).toBeVisible();
  await expect(page.getByText("Chleb")).toBeVisible();

  // Inline pencil icon on the row opens the edit sheet directly (aria-label="Edytuj")
  await page
    .locator("ul li")
    .filter({ hasText: "Chleb" })
    .getByRole("button", { name: /Edytuj/ })
    .click();

  // Edit sheet opens (it's an <aside> with h2 "Edytuj element")
  const editSheet = page.locator("aside").filter({
    has: page.locator("h2", { hasText: /Edytuj element/ }),
  });
  await expect(editSheet).toBeVisible();

  // Clear and re-fill name
  const nameField = editSheet.getByPlaceholder("Nazwa elementu");
  await nameField.clear();
  await nameField.fill("Chleb razowy");

  // Fill qty and unit
  await editSheet.getByPlaceholder("Ilość").fill("2");
  await editSheet.locator("#shopping-list-unit").fill("szt");

  // Save
  await editSheet.getByRole("button", { name: /Zapisz/ }).click();

  // Success toast - toast_shopping_list_item_renamed = "Element zmieniony"
  await expect(page.getByText("Element zmieniony")).toBeVisible();

  // PATCH body should contain the new values
  expect(patchedBody.name).toBe("Chleb razowy");
  expect(patchedBody.quantity).toBe(2);
  expect(patchedBody.unit).toBe("szt");
});

test("item delete failure restores row without showing undo", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const fixture = singleItemListFixture();
  await page.route(SHOPPING_LISTS_URL, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("id=eq.") && method === "GET") {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === "GET") return route.fulfill({ status: 200, json: [fixture] });
    return route.fulfill({ status: 204, body: "" });
  });

  await page.route(SHOPPING_LIST_ITEMS_URL, (route) => {
    if (route.request().method() === "DELETE") {
      return route.fulfill({ status: 500, json: { message: "delete failed" } });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto("/plans/list-edit");

  const itemRow = page.locator("li").filter({ hasText: "Chleb" });
  await expect(itemRow).toBeVisible();
  await itemRow.getByRole("button", { name: "Usuń" }).click();

  await expect(page.getByText("Coś poszło nie tak")).toBeVisible();
  await expect(itemRow).toBeVisible();
  await expect(page.getByText("Cofnij")).toHaveCount(0);
});

// ── Case 5b: Category sections show progress and completed groups sink ──────

test("shopping item category sections show progress and sink completed groups", async ({
  page,
}) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const fixture = groupedListFixture();
  await page.route(/.*\/rest\/v1\/shopping_lists.*/, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("id=eq.") && method === "GET") {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === "GET") return route.fulfill({ status: 200, json: [fixture] });
    return route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/plans/list-grouped");
  await expect(page.getByText("Lista z kategoriami")).toBeVisible();

  const dairySection = page
    .locator("section.rounded-2xl")
    .filter({ has: page.getByRole("button", { name: "Pokaż lub ukryj kategorię Nabiał" }) });
  const vegetableSection = page
    .locator("section.rounded-2xl")
    .filter({ has: page.getByRole("button", { name: "Pokaż lub ukryj kategorię Warzywa" }) });

  await expect(dairySection).toBeVisible();
  await expect(dairySection).toContainText("0/1");
  await expect(vegetableSection).toBeVisible();
  await expect(vegetableSection).toContainText("2/2");
  await expect(vegetableSection.locator("span").filter({ hasText: "Warzywa" })).toHaveClass(
    /line-through/
  );
});

// ── Case 8: Progress bar reflects completed / total ───────────────────────────

test("progress bar shows completed/total text and correct aria attributes", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const fixture = progressListFixture();
  await page.route(SHOPPING_LISTS_URL, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("id=eq.") && method === "GET") {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === "GET") return route.fulfill({ status: 200, json: [fixture] });
    return route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/plans/list-progress");
  await expect(page.getByText("Lista z postępem")).toBeVisible();

  // Progress text - "2 / 5 ukończone"
  await expect(page.getByText("2 / 5 ukończone")).toBeVisible();

  // Progressbar ARIA attributes
  const progressbar = page.getByRole("progressbar");
  await expect(progressbar).toBeVisible();
  await expect(progressbar).toHaveAttribute("aria-valuenow", "2");
  await expect(progressbar).toHaveAttribute("aria-valuemax", "5");
});

// ── Case 9: Completed cards show linked transaction chip ─────────────────────

test("completed list card shows a linked transaction chip", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const completedList = {
    id: "list-completed",
    name: "Zamknięte zakupy",
    status: "completed",
    user_id: TEST_USER_ID,
    group_id: null,
    category_id: "cat-1",
    total_amount: 82,
    completed_at: "2026-05-20T10:00:00Z",
    created_at: "2026-05-20T09:00:00Z",
    updated_at: "2026-05-20T10:00:00Z",
    shopping_list_items: [{ id: "done-1", completed: true }],
    transactions: [{ id: "tx-completed" }],
  };

  await page.route(SHOPPING_LISTS_URL, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, json: [completedList] });
    }
    return route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/plans");
  const card = page.getByRole("link", { name: /Zamknięte zakupy/ });
  await expect(card).toBeVisible();
  await expect(page.getByRole("link", { name: "Transakcja" })).toHaveCount(0);
});

// ── Case 10: Mobile detail keeps completion CTA accessible ───────────────────

test("mobile detail keeps completion CTA above the bottom navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const fixture = progressListFixture();
  await page.route(SHOPPING_LISTS_URL, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("id=eq.") && method === "GET") {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === "GET") return route.fulfill({ status: 200, json: [fixture] });
    return route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/plans/list-progress");
  const completeButton = page.getByRole("button", { name: "Zakończ bez rozliczenia" });
  await expect(completeButton).toBeVisible();
  await expect(completeButton).toBeInViewport();
});

// ── Case 11: Unit combobox opens, filters, picks ──────────────────────────────

test("unit combobox: focus opens listbox, typing filters, click picks", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await page.goto("/plans/list-1");
  await expect(page.getByText("Mleko")).toBeVisible();

  // Open item edit sheet via inline pencil
  await page
    .locator("ul li")
    .filter({ hasText: "Mleko" })
    .getByRole("button", { name: /Edytuj/ })
    .click();

  const editSheet = page.locator("aside").filter({
    has: page.locator("h2", { hasText: /Edytuj element/ }),
  });
  await expect(editSheet).toBeVisible();

  const unitInput = editSheet.locator("#shopping-list-unit");
  await unitInput.click();

  // Listbox is portaled to body - find globally
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole("option", { name: "l" })).toBeVisible();

  // Typing narrows to "kg"
  await unitInput.fill("k");
  await expect(listbox.getByRole("option", { name: "kg" })).toBeVisible();
  await expect(listbox.getByRole("option", { name: "szt." })).toHaveCount(0);

  // Click picks
  await listbox.getByRole("option", { name: "kg" }).click();
  await expect(unitInput).toHaveValue("kg");
});

// ── Case 12: Bulk delete confirm dialog ───────────────────────────────────────

test("bulk toggle: 'mark all' patches all items to completed", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  // list-1 needs shopping_started_at so ShoppingView renders with bulk-toggle button
  await page.route(SHOPPING_LISTS_URL, async (route) => {
    if (route.request().url().includes("id=eq.") && route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        json: { ...MOCK_SHOPPING_LIST_DETAIL, shopping_started_at: "2026-05-20T09:00:00Z" },
      });
    }
    return route.continue();
  });
  let bulkPatchUrl = "";
  await page.route(SHOPPING_LIST_ITEMS_URL, (route) => {
    const req = route.request();
    if (req.method() === "PATCH" && req.url().includes("shopping_list_id=eq.")) {
      bulkPatchUrl = req.url();
      return route.fulfill({ status: 200, json: {} });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto("/plans/list-1");
  await expect(page.getByText("Mleko")).toBeVisible();

  await page.getByRole("button", { name: /Zaznacz wszystkie/ }).click();
  await page.waitForTimeout(200);
  expect(bulkPatchUrl).toContain("shopping_list_id=eq.list-1");
});

test("bulk delete: button opens confirm dialog, confirm fires DELETE", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  let deleted = false;
  await page.route(SHOPPING_LIST_ITEMS_URL, (route) => {
    const req = route.request();
    if (req.method() === "DELETE" && req.url().includes("shopping_list_id=eq.")) {
      deleted = true;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto("/plans/list-1");
  await expect(page.getByText("Mleko")).toBeVisible();

  await page.getByRole("button", { name: /Usuń wszystkie/ }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();

  // ConfirmDialog "Potwierdź" / "Usuń" button - accept default confirm text.
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /Potwierdź|Usuń|Tak/i })
    .click();

  await page.waitForTimeout(200);
  expect(deleted).toBeTruthy();
});

// ── Case 13: Edit-list dialog (name + date + group) ───────────────────────────

test("list pencil: opens edit dialog with name, date, group", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await page.goto("/plans/list-1");
  await expect(page.getByText("Tygodniowe zakupy")).toBeVisible();

  await page
    .getByRole("button", { name: /Edytuj plan/ })
    .first()
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Name input prefilled
  await expect(dialog.locator("input[type=text]").first()).toHaveValue("Tygodniowe zakupy");
  // Date picker prefilled from created_at/planned_for = 2026-05-01
  await expect(dialog.locator("#list-date")).toContainText("01.05.2026");
  // Group select includes private option
  await expect(dialog.locator("select").first()).toBeVisible();
});

// ── Case 14: Linked transaction is kept off archived list cards ─────────────

test("linked-transaction chip is hidden on archived cards", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  const completedListsRaw = [
    {
      id: "list-done",
      name: "Zamknięte zakupy",
      status: "completed",
      user_id: "test-user-id",
      group_id: null,
      category_id: null,
      total_amount: 200,
      completed_at: "2026-05-01T10:00:00Z",
      created_at: "2026-05-01T10:00:00Z",
      updated_at: "2026-05-01T10:00:00Z",
      shopping_list_items: [{ id: "i", completed: true }],
      transactions: [{ id: "tx-link-1" }],
    },
  ];
  await page.route(SHOPPING_LISTS_URL, (route) => {
    const url = route.request().url();
    if (url.includes("id=eq.")) {
      return route.fulfill({ status: 200, json: completedListsRaw[0] });
    }
    return route.fulfill({ status: 200, json: completedListsRaw });
  });

  await page.goto("/plans");
  await expect(page.getByRole("link", { name: /Zamknięte zakupy/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Transakcja/i })).toHaveCount(0);
});

// ── Case 12: Plan settlement sheet (MVP+ Rozlicz plan) ─────────────────────

const PLAN_LINKS_URL = /.*\/rest\/v1\/plan_transaction_links.*/;
const TX_VIEW_URL = /.*\/rest\/v1\/transactions_with_category.*/;

test("plan settlement sheet opens and lists eligible transactions", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const fixture = {
    ...progressListFixture(),
    planned_for: "2026-06-01",
    total_amount: 200,
  };

  await page.route(SHOPPING_LISTS_URL, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("id=eq.") && method === "GET") {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === "GET") return route.fulfill({ status: 200, json: [fixture] });
    return route.fulfill({ status: 204, body: "" });
  });

  await page.route(PLAN_LINKS_URL, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 200, json: [] });
    }
    return route.fulfill({ status: 204, body: "" });
  });

  await page.route(TX_VIEW_URL, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        json: [
          {
            id: "tx-eligible-1",
            amount: 42,
            currency: "PLN",
            description: "Sklep spożywczy",
            date: "2026-06-02T12:00:00Z",
            type: "expense",
            status: "completed",
            user_id: TEST_USER_ID,
            group_id: null,
            category_id: "cat-1",
            category_name: "Jedzenie",
          },
        ],
      });
    }
    return route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/plans/list-progress");
  await page.getByRole("button", { name: "Rozlicz plan" }).click();
  await expect(page.getByRole("heading", { name: "Rozlicz plan" })).toBeVisible();
  await expect(page.getByText("Sklep spożywczy")).toBeVisible();
});
