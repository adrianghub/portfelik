import { expect, test } from '@playwright/test';
import {
  cleanupSmokeData,
  injectRealSession,
  seedSmokeCategory,
  signInRealUser,
  SMOKE_SENTINEL,
  type SmokeSession,
} from './helpers/real-auth';

let session: SmokeSession;
let categoryId: string;

test.beforeAll(async () => {
  session = await signInRealUser();
  await cleanupSmokeData(session);
  categoryId = await seedSmokeCategory(session);
});

test.afterAll(async () => {
  await cleanupSmokeData(session);
});

test('login + create + read + delete transaction against real Supabase', async ({
  page,
  baseURL,
}) => {
  await injectRealSession(page, session, baseURL!);

  await page.goto('/transactions');
  await expect(page).toHaveURL(/\/transactions/, { timeout: 15000 });

  // Open the create dialog (desktop button — first match avoids mobile FAB).
  await page
    .getByRole('button', { name: /Dodaj transakcję/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();

  const description = `${SMOKE_SENTINEL} ${Date.now()}`;
  await page.locator('#tx-amount').fill('1.23');
  await page.locator('#tx-desc').fill(description);

  // Wait for the seeded category to appear in the select before picking it —
  // categories load via TanStack Query on page mount, may not be ready yet.
  const categorySelect = page.locator('#tx-cat');
  await expect(categorySelect.locator(`option[value="${categoryId}"]`)).toBeAttached({
    timeout: 10000,
  });
  await categorySelect.selectOption(categoryId);

  await page.getByRole('button', { name: 'Zapisz' }).click();

  // Toast then row visible in the list.
  await expect(page.getByText('Transakcja dodana')).toBeVisible({
    timeout: 10000,
  });
  await expect(page.locator('table').getByText(description)).toBeVisible({
    timeout: 10000,
  });

  // Open the row's detail sheet and delete.
  await page.locator('table tbody tr', { hasText: description }).first().click();
  const sheet = page.locator('aside');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Usuń' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Usuń' })
    .click();

  await expect(page.getByText('Transakcja usunięta')).toBeVisible({
    timeout: 10000,
  });
  await expect(page.locator('table').getByText(description)).toHaveCount(0);
});
