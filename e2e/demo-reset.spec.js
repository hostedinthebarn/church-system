const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const AXE_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ];
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'e2e-only-password';

// The reset itself runs in test-db/demo.test.js: here it would replace the
// people every other spec signs in as. This checks the screen and the
// "are you sure" step, which stop short of resetting.
async function signIn(page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[name="username"]').first().fill('e2e-admin');
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input[type="password"]').press('Enter');
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}

test('the reset page is closed to visitors', async ({ request }) => {
  expect((await request.get('/demo')).status()).toBe(404);
  expect((await request.post('/demo/reset', { data: {} })).status()).toBeGreaterThanOrEqual(400);
});

test('the office is asked to type the word first, and a wrong word resets nothing', async ({ page }) => {
  await signIn(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Reset demo' }).click();
  await expect(page.getByRole('heading', { name: 'Reset demo' })).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations).toEqual([]);

  await page.getByLabel(/To confirm, type RESET/).fill('nope');
  await page.getByRole('button', { name: 'Reset the demo data' }).click();
  await expect(page.locator('[data-demo-error]')).toContainText('did not match');
  await expect(page.locator('[data-demo-result]')).toHaveCount(0);
});
