const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const AXE_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ];

test.describe('home page', () => {
  test('loads, is noindexed and shows the demo banner', async ({ page }) => {
    const response = await page.goto('/');
    expect(response.status()).toBe(200);
    expect(response.headers()['x-robots-tag']).toContain('noindex');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('[data-demo-banner]')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Member sign-in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Give' })).toBeVisible();
  });

  test('has no axe violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test('Spanish is hidden from visitors', async ({ request }) => {
    const response = await request.get('/es/');
    expect(response.status()).toBe(404);
  });
});

test.describe('admin login', () => {
  test('loads, is noindexed and shows the demo banner', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response.status()).toBe(200);
    expect(response.headers()['x-robots-tag']).toContain('noindex');
    await expect(page.locator('[data-demo-banner]')).toBeVisible();
    // The form is rendered by Apostrophe's UI, so wait for its fields.
    await expect(page.locator('input').first()).toBeVisible();
  });

  test('has no axe violations', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });
});
