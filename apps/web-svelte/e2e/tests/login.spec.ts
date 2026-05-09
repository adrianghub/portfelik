import { expect, test } from '@playwright/test';
import { injectFakeSession, mockSupabaseAPI } from '../helpers/mock-auth';

test('unauthenticated: /transactions redirects to /login', async ({ page }) => {
  await page.goto('/transactions');
  await expect(page).toHaveURL('/login', { timeout: 10000 });
});

test('login page renders Google sign-in button', async ({ page }) => {
  await page.goto('/login');
  await expect(
    page.getByRole('button', { name: 'Zaloguj się z Google' }),
  ).toBeVisible();
});

test('authenticated: /transactions loads without redirect', async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await page.goto('/transactions');
  await expect(page).toHaveURL('/transactions', { timeout: 10000 });
});
