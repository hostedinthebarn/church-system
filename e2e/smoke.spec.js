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

test.describe('emailed-link sign-in', () => {
  test('the sign-in page loads, is noindexed and has no axe violations', async ({ page }) => {
    const response = await page.goto('/sign-in');
    expect(response.status()).toBe(200);
    expect(response.headers()['x-robots-tag']).toContain('noindex');
    await expect(page.getByLabel('Email address')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations).toEqual([]);
  });

  test('a request gets the same answer whoever the address belongs to', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill('nobody-here@example.com');
    await page.getByRole('button', { name: 'Send me a link' }).click();
    await expect(page.getByRole('status')).toContainText('If that address belongs to a member');
  });

  test('a link that was never issued does not sign anyone in', async ({ page }) => {
    await page.goto('/sign-in/verify?token=not-a-real-token');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('expired');
  });

  test('the dev outbox is viewable with the fake sender', async ({ page }) => {
    const response = await page.goto('/dev/outbox');
    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Dev outbox' })).toBeVisible();
  });
});
