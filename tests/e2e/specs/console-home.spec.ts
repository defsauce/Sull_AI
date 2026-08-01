import { test, expect } from '@playwright/test';

test('console home shows Sull AI brand', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Sull AI', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});
