import { expect, test } from '@playwright/test';
import { injectFakeSession, mockSupabaseAPI } from '../helpers/mock-auth';

test.beforeEach(async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
});

test('lists page renders active lists', async ({ page }) => {
  await page.goto('/shopping-lists');
  await expect(page.getByText('Tygodniowe zakupy')).toBeVisible();
});

test('create list: dialog opens, submit shows success toast', async ({ page }) => {
  await page.goto('/shopping-lists');
  await expect(page.getByText('Tygodniowe zakupy')).toBeVisible();

  // Open create dialog — button text is "+ Dodaj" (common_add = "Dodaj")
  await page.getByRole('button', { name: /\+ Dodaj/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Nowa lista zakupów')).toBeVisible();

  // Fill name
  await page.locator('#sl-name').fill('Nowa lista testowa');

  // Submit — common_save = "Zapisz"
  await page.getByRole('button', { name: 'Zapisz' }).click();

  // Toast — toast_shopping_list_created = "Lista zakupów dodana"
  await expect(page.getByText('Lista zakupów dodana')).toBeVisible();
});

test('list detail: navigating to list shows items', async ({ page }) => {
  await page.goto('/shopping-lists');
  await expect(page.getByText('Tygodniowe zakupy')).toBeVisible();

  // Click the list card anchor element
  await page.getByRole('link', { name: /Tygodniowe zakupy/ }).click();

  // Navigated to detail
  await expect(page).toHaveURL('/shopping-lists/list-1');
  await expect(page.getByText('Mleko')).toBeVisible();
  await expect(page.getByText('Chleb')).toBeVisible();
});

test('check off item: clicking the row body toggles without error', async ({ page }) => {
  const patches: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && req.url().includes('/shopping_list_items')) {
      patches.push(req.url());
    }
  });

  await page.goto('/shopping-lists/list-1');
  await expect(page.getByText('Mleko')).toBeVisible();

  // Click the row body (the name span), NOT the small checkbox indicator
  await page.getByText('Mleko').click();
  await page.waitForTimeout(300);

  // Row click fires the toggle PATCH
  expect(patches.length).toBeGreaterThan(0);
  await expect(page.getByText(/Coś poszło nie tak/)).not.toBeVisible();
});

test('row kebab: opens action sheet with rename + delete', async ({ page }) => {
  await page.goto('/shopping-lists/list-1');
  await expect(page.getByText('Mleko')).toBeVisible();

  // Each item row has a kebab button labelled "Akcje"
  const kebab = page
    .locator('ul li')
    .filter({ hasText: 'Mleko' })
    .getByRole('button', { name: /Akcje/ });
  await kebab.click();

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: /Zmień nazwę/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Usuń/ })).toBeVisible();
});

test('back-nav after add: shopping_lists summary refetches', async ({ page }) => {
  let listGetCount = 0;
  page.on('request', (req) => {
    const url = req.url();
    if (
      req.method() === 'GET' &&
      url.includes('/shopping_lists') &&
      !url.includes('id=eq.')
    ) {
      listGetCount++;
    }
  });

  await page.goto('/shopping-lists');
  await expect(page.getByText('Tygodniowe zakupy')).toBeVisible();

  await page.getByRole('link', { name: /Tygodniowe zakupy/ }).click();
  await expect(page).toHaveURL('/shopping-lists/list-1');
  await expect(page.getByText('Mleko')).toBeVisible();

  // Add an item from the detail page
  await page.getByRole('button', { name: /\+ Dodaj element/ }).click();
  await page.locator('#item-name').fill('Cebula testowa');
  await page.getByRole('button', { name: /^Dodaj$/ }).click();
  await expect(page.getByText('Element dodany')).toBeVisible();

  const before = listGetCount;

  await page.goBack();
  await expect(page.getByText('Tygodniowe zakupy')).toBeVisible();
  await page.waitForTimeout(500);

  // Detail-page mutation must invalidate the summary cache so back-nav refetches
  expect(listGetCount).toBeGreaterThan(before);
});

test('complete list: dialog, submit, success toast', async ({ page }) => {
  await page.goto('/shopping-lists/list-1');
  await expect(page.getByText('Mleko')).toBeVisible();

  // Click "Zakończ listę" button — shopping_list_complete_title = "Zakończ listę"
  await page.getByRole('button', { name: 'Zakończ listę' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Fill amount
  await page.locator('#comp-amount').fill('120');

  // Select category
  await page.locator('#comp-cat').selectOption('cat-1');

  // Submit — shopping_list_complete_submit = "Zakończ i utwórz transakcję"
  await page.getByRole('button', { name: 'Zakończ i utwórz transakcję' }).click();

  // Success toast — shopping_list_completed_celebration = "🎉 Lista zrobiona!"
  await expect(page.getByText('Lista zrobiona')).toBeVisible();
});
