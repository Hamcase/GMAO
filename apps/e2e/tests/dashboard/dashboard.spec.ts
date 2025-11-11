import { test, expect } from '@playwright/test';
import { AuthPageObject } from '../authentication/auth.po';

// Smoke test: sign up, visit dashboard, check REAL DATA badges appear
// Requires local dev server at http://localhost:3000

test.describe('Dashboard real data', () => {
  test('shows REAL DATA badges on KPIs after login', async ({ page }) => {
    const auth = new AuthPageObject(page);

    // Sign up new user and land in /home
    await auth.signUpFlow('/home/dashboard');

    // Navigate to dashboard (if not already there)
    await page.goto('/home/dashboard');

    // Expect KPI titles present
    await expect(page.getByText('MTBF Moyen')).toBeVisible();
    await expect(page.getByText('MTTR Moyen')).toBeVisible();
    await expect(page.getByText('Disponibilité')).toBeVisible();
    await expect(page.getByText("Utilisation Équipe")).toBeVisible();

    // Expect REAL DATA badges appear (after data loads)
    const realBadges = page.getByText('REAL DATA');
    await expect(realBadges.first()).toBeVisible();

    // Expect numbers look reasonable
    const mtbfValue = await page.locator('text=heures').first().textContent();
    expect(mtbfValue).toBeTruthy();
  });
});
