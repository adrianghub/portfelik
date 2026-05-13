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

test('check off item: no error toast after clicking checkbox', async ({ page }) => {
  await page.goto('/shopping-lists/list-1');
  await expect(page.getByText('Mleko')).toBeVisible();

  // Click the toggle button for the first item (Mleko, completed=false)
  // Each li has: toggle button (first), then delete button (second)
  const toggleButtons = page.locator('ul.space-y-1 li button').first();
  await toggleButtons.click();

  // Verify no error toast
  await expect(page.getByText(/Coś poszło nie tak/)).not.toBeVisible();
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
