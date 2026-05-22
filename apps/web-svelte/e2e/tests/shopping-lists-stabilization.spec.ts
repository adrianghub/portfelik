/**
 * Playwright regression spec — shopping-list stabilization bundle.
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

import { expect, test } from '@playwright/test';
import { TEST_USER_ID } from '../helpers/fixtures';
import { injectFakeSession, mockSupabaseAPI } from '../helpers/mock-auth';

const SUPABASE_URL = 'https://emqzcygfwcvbmhxhfkcc.supabase.co';

// ── Fixture helpers ──────────────────────────────────────────────────────────

/** One active list, no items (for quick-add tests). */
function emptyListFixture() {
  return {
    id: 'list-empty',
    name: 'Lista bez elementów',
    status: 'active',
    user_id: TEST_USER_ID,
    group_id: null,
    category_id: null,
    total_amount: null,
    completed_at: null,
    created_at: '2026-05-20T10:00:00Z',
    updated_at: '2026-05-20T10:00:00Z',
    shopping_list_items: [],
  };
}

/** One active list with 5 items, 2 completed. */
function progressListFixture() {
  return {
    id: 'list-progress',
    name: 'Lista z postępem',
    status: 'active',
    user_id: TEST_USER_ID,
    group_id: null,
    category_id: null,
    total_amount: null,
    completed_at: null,
    created_at: '2026-05-20T10:00:00Z',
    updated_at: '2026-05-20T10:00:00Z',
    shopping_list_items: [
      {
        id: 'pi-1',
        name: 'Mleko',
        quantity: 2,
        unit: 'l',
        completed: true,
        position: 1,
        shopping_list_id: 'list-progress',
        created_at: '2026-05-20T10:00:00Z',
        updated_at: '2026-05-20T10:00:00Z',
      },
      {
        id: 'pi-2',
        name: 'Chleb',
        quantity: 1,
        unit: null,
        completed: true,
        position: 2,
        shopping_list_id: 'list-progress',
        created_at: '2026-05-20T10:00:00Z',
        updated_at: '2026-05-20T10:00:00Z',
      },
      {
        id: 'pi-3',
        name: 'Jajka',
        quantity: null,
        unit: null,
        completed: false,
        position: 3,
        shopping_list_id: 'list-progress',
        created_at: '2026-05-20T10:00:00Z',
        updated_at: '2026-05-20T10:00:00Z',
      },
      {
        id: 'pi-4',
        name: 'Masło',
        quantity: null,
        unit: null,
        completed: false,
        position: 4,
        shopping_list_id: 'list-progress',
        created_at: '2026-05-20T10:00:00Z',
        updated_at: '2026-05-20T10:00:00Z',
      },
      {
        id: 'pi-5',
        name: 'Ser',
        quantity: null,
        unit: null,
        completed: false,
        position: 5,
        shopping_list_id: 'list-progress',
        created_at: '2026-05-20T10:00:00Z',
        updated_at: '2026-05-20T10:00:00Z',
      },
    ],
  };
}

/** One active list with one item (for item-edit-sheet test). */
function singleItemListFixture() {
  return {
    id: 'list-edit',
    name: 'Lista do edycji',
    status: 'active',
    user_id: TEST_USER_ID,
    group_id: null,
    category_id: null,
    total_amount: null,
    completed_at: null,
    created_at: '2026-05-20T10:00:00Z',
    updated_at: '2026-05-20T10:00:00Z',
    shopping_list_items: [
      {
        id: 'ei-1',
        name: 'Chleb',
        quantity: null,
        unit: null,
        completed: false,
        position: 1,
        shopping_list_id: 'list-edit',
        created_at: '2026-05-20T10:00:00Z',
        updated_at: '2026-05-20T10:00:00Z',
      },
    ],
  };
}

/**
 * Override the shopping_list_items GET endpoint with a static list — used to
 * seed suggestion history for the combobox tests.
 */
async function seedItemHistory(
  page: Parameters<typeof test>[1]['page'],
  items: { name: string; quantity: number | null; unit: string | null }[],
) {
  await page.route(`${SUPABASE_URL}/rest/v1/shopping_list_items**`, (route) => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ status: 200, json: items });
    return route.fulfill({ status: 200, json: {} });
  });
}

// ── Case 1: Quick-add accepts name-only items ─────────────────────────────────

test('quick-add accepts name-only items', async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  // Return the empty list for the detail route
  const fixture = emptyListFixture();
  await page.route(`${SUPABASE_URL}/rest/v1/shopping_lists**`, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('id=eq.') && method === 'GET') {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === 'GET') return route.fulfill({ status: 200, json: [fixture] });
    if (method === 'POST') return route.fulfill({ status: 201, json: fixture });
    return route.fulfill({ status: 204, body: '' });
  });

  // POST to shopping_list_items returns the new item
  await page.route(`${SUPABASE_URL}/rest/v1/shopping_list_items**`, (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      return route.fulfill({
        status: 201,
        json: {
          id: 'item-quick-1',
          name: 'Pomidory',
          quantity: null,
          unit: null,
          completed: false,
          position: 1,
          shopping_list_id: fixture.id,
          created_at: '2026-05-20T10:00:00Z',
          updated_at: '2026-05-20T10:00:00Z',
        },
      });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto('/shopping-lists/list-empty');
  await expect(page.getByText('Lista bez elementów')).toBeVisible();

  // The ShoppingListItemQuickAdd form has a combobox input with placeholder "Nazwa elementu"
  const nameInput = page.getByRole('combobox');
  await nameInput.fill('Pomidory');

  // Click the submit button — aria label is the submit button next to the toggle
  await page.getByRole('button', { name: /Dodaj element/ }).click();

  // Toast: "Element dodany"
  await expect(page.getByText('Element dodany')).toBeVisible();
});

// ── Case 2: Quick-add accepts inline quantity + unit ──────────────────────────

test('quick-add accepts inline quantity + unit', async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const fixture = emptyListFixture();
  await page.route(`${SUPABASE_URL}/rest/v1/shopping_lists**`, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('id=eq.') && method === 'GET') {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === 'GET') return route.fulfill({ status: 200, json: [fixture] });
    if (method === 'POST') return route.fulfill({ status: 201, json: fixture });
    return route.fulfill({ status: 204, body: '' });
  });

  let postedBody: Record<string, unknown> = {};
  await page.route(`${SUPABASE_URL}/rest/v1/shopping_list_items**`, (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      try {
        postedBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      } catch {
        postedBody = {};
      }
      return route.fulfill({
        status: 201,
        json: {
          id: 'item-qty-1',
          name: 'Bułka',
          quantity: 2,
          unit: 'szt',
          completed: false,
          position: 1,
          shopping_list_id: fixture.id,
          created_at: '2026-05-20T10:00:00Z',
          updated_at: '2026-05-20T10:00:00Z',
        },
      });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto('/shopping-lists/list-empty');
  await expect(page.getByText('Lista bez elementów')).toBeVisible();

  // Click the "Ilość / jednostka" toggle button via aria-controls attribute
  const detailsToggle = page.locator('[aria-controls="shopping-list-item-details"]');
  await detailsToggle.click();

  // The details row should now be visible — fill qty and unit
  await expect(page.locator('#shopping-list-item-details')).toBeVisible();

  // Fill qty (type="number" placeholder = "Ilość") and unit (type="text" placeholder = "Jednostka")
  await page.getByPlaceholder('Ilość').fill('2');
  await page.getByPlaceholder('Jednostka').fill('szt');

  // Fill name and submit
  const nameInput = page.getByRole('combobox');
  await nameInput.fill('Bułka');
  await page.getByRole('button', { name: /Dodaj element/ }).click();

  // Toast success
  await expect(page.getByText('Element dodany')).toBeVisible();

  // The POST body should include quantity=2 and unit="szt"
  expect(postedBody.quantity).toBe(2);
  expect(postedBody.unit).toBe('szt');
});

// ── Case 3: Suggestion dropdown hides on Escape ───────────────────────────────

test('suggestion dropdown hides on Escape', async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const fixture = emptyListFixture();
  await page.route(`${SUPABASE_URL}/rest/v1/shopping_lists**`, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('id=eq.') && method === 'GET') {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === 'GET') return route.fulfill({ status: 200, json: [fixture] });
    return route.fulfill({ status: 204, body: '' });
  });

  // Seed history — one item matching "ch"
  await seedItemHistory(page, [{ name: 'Chleb', quantity: 1, unit: null }]);

  await page.goto('/shopping-lists/list-empty');
  await expect(page.getByText('Lista bez elementów')).toBeVisible();

  const nameInput = page.getByRole('combobox');
  await nameInput.focus();
  await nameInput.fill('ch');

  // Listbox should appear
  await expect(page.getByRole('listbox')).toBeVisible();

  // Press Escape — listbox hides
  await nameInput.press('Escape');
  await expect(page.getByRole('listbox')).not.toBeVisible();
});

// ── Case 4: Suggestion select fills name + auto-opens details ─────────────────

test('suggestion select fills name and auto-opens details', async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const fixture = emptyListFixture();
  await page.route(`${SUPABASE_URL}/rest/v1/shopping_lists**`, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('id=eq.') && method === 'GET') {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === 'GET') return route.fulfill({ status: 200, json: [fixture] });
    return route.fulfill({ status: 204, body: '' });
  });

  // Seed history — "Mleko" with quantity=1, unit="l"
  await seedItemHistory(page, [{ name: 'Mleko', quantity: 1, unit: 'l' }]);

  await page.goto('/shopping-lists/list-empty');
  await expect(page.getByText('Lista bez elementów')).toBeVisible();

  const nameInput = page.getByRole('combobox');
  await nameInput.focus();
  await nameInput.fill('ml');

  // Listbox appears with "Mleko"
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('option', { name: /Mleko/ })).toBeVisible();

  // Click the suggestion
  await page.getByRole('option', { name: /Mleko/ }).click();

  // Name input should now contain "Mleko"
  await expect(nameInput).toHaveValue('Mleko');

  // Details row should be open (quantity+unit were present in suggestion)
  await expect(page.locator('#shopping-list-item-details')).toBeVisible();

  // The qty and unit inputs should be pre-filled
  await expect(page.getByPlaceholder('Ilość')).toHaveValue('1');
  await expect(page.getByPlaceholder('Jednostka')).toHaveValue('l');
});

// ── Case 5: Item edit sheet updates name + qty + unit ─────────────────────────

test('item edit sheet updates name, quantity and unit', async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const fixture = singleItemListFixture();
  await page.route(`${SUPABASE_URL}/rest/v1/shopping_lists**`, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('id=eq.') && method === 'GET') {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === 'GET') return route.fulfill({ status: 200, json: [fixture] });
    return route.fulfill({ status: 204, body: '' });
  });

  let patchedBody: Record<string, unknown> = {};
  await page.route(`${SUPABASE_URL}/rest/v1/shopping_list_items**`, (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      try {
        patchedBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      } catch {
        patchedBody = {};
      }
      return route.fulfill({ status: 200, json: {} });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto('/shopping-lists/list-edit');
  await expect(page.getByText('Lista do edycji')).toBeVisible();
  await expect(page.getByText('Chleb')).toBeVisible();

  // Open item actions via the kebab button (aria-label="Akcje")
  const kebab = page
    .locator('ul li')
    .filter({ hasText: 'Chleb' })
    .getByRole('button', { name: /Akcje/ });
  await kebab.click();

  // Actions sheet — click "Zmień nazwę"
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /Zmień nazwę/ }).click();

  // Edit sheet opens (it's an <aside> with aria-label matching "Zmień nazwę elementu")
  const editSheet = page.locator('aside').filter({
    has: page.locator('h2', { hasText: /Zmień nazwę/ }),
  });
  await expect(editSheet).toBeVisible();

  // Clear and re-fill name
  const nameField = editSheet.getByPlaceholder('Nazwa elementu');
  await nameField.clear();
  await nameField.fill('Chleb razowy');

  // Fill qty and unit
  await editSheet.getByPlaceholder('Ilość').fill('2');
  await editSheet.getByPlaceholder('Jednostka').fill('szt');

  // Save
  await editSheet.getByRole('button', { name: /Zapisz/ }).click();

  // Success toast — toast_shopping_list_item_renamed = "Element zmieniony"
  await expect(page.getByText('Element zmieniony')).toBeVisible();

  // PATCH body should contain the new values
  expect(patchedBody.name).toBe('Chleb razowy');
  expect(patchedBody.quantity).toBe(2);
  expect(patchedBody.unit).toBe('szt');
});

// ── Case 6: Attach action visible/hidden per transaction type ─────────────────

test('attach button visible only for unlinked expense transactions', async ({ page }) => {
  await injectFakeSession(page);

  const SUPABASE = SUPABASE_URL;

  const expenseNoList = {
    id: 'tx-attach',
    date: '2026-05-20',
    description: 'Zakupy',
    amount: 50,
    type: 'expense',
    status: 'paid',
    category_id: 'cat-1',
    category_name: 'Jedzenie',
    is_recurring: false,
    recurring_day: null,
    currency: 'PLN',
    user_id: TEST_USER_ID,
    group_id: null,
    shopping_list_id: null,
    created_at: '2026-05-20T10:00:00Z',
    updated_at: '2026-05-20T10:00:00Z',
  };
  const incomeTx = { ...expenseNoList, id: 'tx-income', type: 'income', description: 'Pensja' };
  const expenseWithList = {
    ...expenseNoList,
    id: 'tx-linked',
    description: 'Powiązane',
    shopping_list_id: 'list-1',
  };

  // Sub-check A: unlinked expense → attach button visible
  await page.route(`${SUPABASE}/auth/v1/**`, (r) => r.fulfill({ status: 200, json: { id: TEST_USER_ID, role: 'authenticated' } }));
  await page.route(`${SUPABASE}/rest/v1/**`, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/profiles')) return route.fulfill({ status: 200, json: [{ id: TEST_USER_ID, email: 'test@portfelik.test', name: 'Test User', role: 'user', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' }] });
    if (url.includes('/categories')) return route.fulfill({ status: 200, json: [{ id: 'cat-1', name: 'Jedzenie', type: 'expense', user_id: null }] });
    if (url.includes('/transactions_with_category')) return route.fulfill({ status: 200, json: [expenseNoList] });
    if (url.includes('/transactions') && method !== 'GET') return route.fulfill({ status: 200, json: {} });
    if (url.includes('/transactions')) return route.fulfill({ status: 200, json: [expenseNoList] });
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto('/transactions');
  await expect(page.locator('table').getByText('Zakupy')).toBeVisible();

  // Open detail sheet by clicking the row
  await page.locator('tbody tr').first().click();
  const sheet = page.locator('aside');
  await expect(sheet).toBeVisible();

  // Attach button should be visible for unlinked expense
  await expect(sheet.getByRole('button', { name: /Połącz z listą zakupów/ })).toBeVisible({ timeout: 5000 });
  // Close sheet
  await page.keyboard.press('Escape');
  await expect(sheet).not.toBeVisible();

  // Sub-check B: income transaction → no attach button
  await page.unrouteAll();
  await page.route(`${SUPABASE}/auth/v1/**`, (r) => r.fulfill({ status: 200, json: { id: TEST_USER_ID, role: 'authenticated' } }));
  await page.route(`${SUPABASE}/rest/v1/**`, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/profiles')) return route.fulfill({ status: 200, json: [{ id: TEST_USER_ID, email: 'test@portfelik.test', name: 'Test User', role: 'user', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' }] });
    if (url.includes('/categories')) return route.fulfill({ status: 200, json: [{ id: 'cat-1', name: 'Jedzenie', type: 'expense', user_id: null }] });
    if (url.includes('/transactions_with_category')) return route.fulfill({ status: 200, json: [incomeTx] });
    if (url.includes('/transactions') && method !== 'GET') return route.fulfill({ status: 200, json: {} });
    if (url.includes('/transactions')) return route.fulfill({ status: 200, json: [incomeTx] });
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto('/transactions');
  await expect(page.locator('table').getByText('Pensja')).toBeVisible();
  await page.locator('tbody tr').first().click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Połącz z listą zakupów/ })).not.toBeVisible();
  await page.keyboard.press('Escape');

  // Sub-check C: expense already linked → no attach button
  await page.unrouteAll();
  await page.route(`${SUPABASE}/auth/v1/**`, (r) => r.fulfill({ status: 200, json: { id: TEST_USER_ID, role: 'authenticated' } }));
  await page.route(`${SUPABASE}/rest/v1/**`, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/profiles')) return route.fulfill({ status: 200, json: [{ id: TEST_USER_ID, email: 'test@portfelik.test', name: 'Test User', role: 'user', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' }] });
    if (url.includes('/categories')) return route.fulfill({ status: 200, json: [{ id: 'cat-1', name: 'Jedzenie', type: 'expense', user_id: null }] });
    if (url.includes('/transactions_with_category')) return route.fulfill({ status: 200, json: [expenseWithList] });
    if (url.includes('/transactions') && method !== 'GET') return route.fulfill({ status: 200, json: {} });
    if (url.includes('/transactions')) return route.fulfill({ status: 200, json: [expenseWithList] });
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto('/transactions');
  await expect(page.locator('table').getByText('Powiązane')).toBeVisible();
  await page.locator('tbody tr').first().click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Połącz z listą zakupów/ })).not.toBeVisible();
});

// ── Case 7: Attach picker invokes RPC and toasts on success ───────────────────

test('attach picker invokes RPC and shows success toast', async ({ page }) => {
  await injectFakeSession(page);

  const SUPABASE = SUPABASE_URL;

  const expenseNoList = {
    id: 'tx-rpc',
    date: '2026-05-20',
    description: 'Zakupy do koszyka',
    amount: 75,
    type: 'expense',
    status: 'paid',
    category_id: 'cat-1',
    category_name: 'Jedzenie',
    is_recurring: false,
    recurring_day: null,
    currency: 'PLN',
    user_id: TEST_USER_ID,
    group_id: null,
    shopping_list_id: null,
    created_at: '2026-05-20T10:00:00Z',
    updated_at: '2026-05-20T10:00:00Z',
  };

  // An attachable list to pick from (has items so it passes the .filter)
  const attachableList = {
    id: 'list-rpc',
    name: 'Tygodniowe zakupy',
    status: 'active',
    user_id: TEST_USER_ID,
    group_id: null,
    category_id: null,
    total_amount: null,
    completed_at: null,
    created_at: '2026-05-20T09:00:00Z',
    updated_at: '2026-05-20T09:00:00Z',
    shopping_list_items: [{ id: 'sl-i1', completed: false }],
  };

  let rpcCalled = false;

  await page.route(`${SUPABASE}/auth/v1/**`, (r) => r.fulfill({ status: 200, json: { id: TEST_USER_ID, role: 'authenticated' } }));
  await page.route(`${SUPABASE}/rest/v1/**`, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/profiles')) return route.fulfill({ status: 200, json: [{ id: TEST_USER_ID, email: 'test@portfelik.test', name: 'Test User', role: 'user', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' }] });
    if (url.includes('/categories')) return route.fulfill({ status: 200, json: [{ id: 'cat-1', name: 'Jedzenie', type: 'expense', user_id: null }] });
    if (url.includes('/transactions_with_category')) return route.fulfill({ status: 200, json: [expenseNoList] });
    if (url.includes('/transactions') && method !== 'GET') return route.fulfill({ status: 200, json: {} });
    if (url.includes('/transactions')) return route.fulfill({ status: 200, json: [expenseNoList] });
    if (url.includes('/shopping_lists')) return route.fulfill({ status: 200, json: [attachableList] });
    if (url.includes('/rpc/attach_shopping_list_to_transaction')) {
      rpcCalled = true;
      return route.fulfill({ status: 200, json: null });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto('/transactions');
  await expect(page.locator('table').getByText('Zakupy do koszyka')).toBeVisible();

  // Open transaction detail sheet
  await page.locator('tbody tr').first().click();
  const detailSheet = page.locator('aside');
  await expect(detailSheet).toBeVisible();

  // Click the attach button — it closes the detail sheet and opens the picker sheet
  const attachBtn = detailSheet.getByRole('button', { name: /Połącz z listą zakupów/ });
  await expect(attachBtn).toBeVisible({ timeout: 5000 });
  await attachBtn.click();

  // Picker sheet opens with the attachable list
  const pickerSheet = page.locator('aside');
  await expect(pickerSheet.getByText('Tygodniowe zakupy')).toBeVisible({ timeout: 5000 });

  // Click the list to attach
  await pickerSheet.getByRole('button', { name: /Tygodniowe zakupy/ }).click();

  // Success toast: "Lista połączona z transakcją"
  await expect(page.getByText('Lista połączona z transakcją')).toBeVisible();
  expect(rpcCalled).toBe(true);
});

// ── Case 8: Progress bar reflects completed / total ───────────────────────────

test('progress bar shows completed/total text and correct aria attributes', async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  const fixture = progressListFixture();
  await page.route(`${SUPABASE_URL}/rest/v1/shopping_lists**`, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('id=eq.') && method === 'GET') {
      return route.fulfill({ status: 200, json: fixture });
    }
    if (method === 'GET') return route.fulfill({ status: 200, json: [fixture] });
    return route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/shopping-lists/list-progress');
  await expect(page.getByText('Lista z postępem')).toBeVisible();

  // Progress text — "2 / 5 ukończone"
  await expect(page.getByText('2 / 5 ukończone')).toBeVisible();

  // Progressbar ARIA attributes
  const progressbar = page.getByRole('progressbar');
  await expect(progressbar).toBeVisible();
  await expect(progressbar).toHaveAttribute('aria-valuenow', '2');
  await expect(progressbar).toHaveAttribute('aria-valuemax', '5');
});
