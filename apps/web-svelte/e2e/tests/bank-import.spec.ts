import { expect, test } from '@playwright/test';
import { injectFakeSession, mockSupabaseAPI } from '../helpers/mock-auth';

test.beforeEach(async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
});

test('import wizard: renders heading, step pill and upload dropzone', async ({ page }) => {
  await page.goto('/transactions/import');

  // h1
  await expect(
    page.getByRole('heading', { name: 'Import wyciągu bankowego' })
  ).toBeVisible();

  // Step pill — first step active
  await expect(page.getByText('Wgraj plik', { exact: true })).toBeVisible();
  await expect(page.getByText('Sprawdź pozycje', { exact: true })).toBeVisible();
  await expect(page.getByText('Zakończono', { exact: true })).toBeVisible();

  // Dropzone CTA
  await expect(page.getByText(/Upuść plik CSV tutaj/)).toBeVisible();
});

test('import wizard: invalid CSV surfaces unknown-kind error', async ({ page }) => {
  await page.goto('/transactions/import');

  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeAttached();

  // Junk content the bank detectors will fail to match.
  await fileInput.setInputFiles({
    name: 'junk.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('not a real bank export\nfoo,bar,baz\n1,2,3\n', 'utf8'),
  });

  // bank_upload_kind_unknown copy
  await expect(page.getByText(/Nie rozpoznano formatu/)).toBeVisible({
    timeout: 10_000,
  });
});
