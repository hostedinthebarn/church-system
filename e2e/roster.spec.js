const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const AXE_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ];
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'e2e-only-password';
// A month nobody else uses, so a repeat run on the same database starts clean.
const MONTH = `${3000 + Math.floor(Math.random() * 6000)}-0${1 + Math.floor(Math.random() * 9)}`;

test.describe.configure({ mode: 'serial' });

async function signIn(page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[name="username"]').first().fill('e2e-admin');
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input[type="password"]').press('Enter');
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}

test('the roster and away screens are closed to visitors', async ({ request }) => {
  for (const url of [ '/roster', `/roster/${MONTH}`, `/roster/${MONTH}/print`, '/away' ]) {
    expect((await request.get(url)).status(), url).toBe(404);
  }
  for (const url of [ `/roster/${MONTH}/save`, `/roster/${MONTH}/publish`, `/roster/${MONTH}/swap`, '/away/add' ]) {
    expect((await request.post(url, { data: {} })).status(), url).toBeGreaterThanOrEqual(400);
  }
});

test('the office sees the suggested month with warnings, saves it and publishes it', async ({ page }) => {
  await signIn(page);
  await page.goto('/roster');
  await expect(page.getByRole('heading', { name: 'Servers roster' })).toBeVisible();

  expect((await page.goto('/roster/not-a-month')).status()).toBe(404);

  await page.goto(`/roster/${MONTH}`);
  await expect(page.locator('[data-roster-state]')).toContainText('not saved yet');
  // Seven roles with empty serving groups: every slot is unfilled and says so.
  await expect(page.locator('[data-warning="empty"]').first()).toBeVisible();
  await expect(page.getByLabel(/Slot 1/).first()).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations).toEqual([]);

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.locator('[data-roster-state]')).toContainText('Draft');

  await page.getByRole('button', { name: 'Publish and email' }).click();
  await expect(page.locator('[data-roster-state]')).toContainText('Published');
  await expect(page.locator('[data-roster-notice]')).toContainText('Email:');
  await expect(page.getByRole('button', { name: /Save swaps/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish and email' })).toHaveCount(0);
});

test('the printable list is plain and accessible', async ({ page }) => {
  await signIn(page);
  await page.goto(`/roster/${MONTH}/print`);
  // The month reads as a month ("December 2026"), in the page's locale.
  const monthName = new Date(`${MONTH}-01T12:00:00Z`).toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  await expect(page.getByRole('heading', { name: `Servers for ${monthName}` })).toBeVisible();
  await expect(page.getByRole('table').first()).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations).toEqual([]);
});

test('the office can open the away-dates screen and pick a household', async ({ page }) => {
  await signIn(page);
  await page.goto('/away');
  await expect(page.getByRole('heading', { name: 'Away dates' })).toBeVisible();
  await expect(page.getByText('Choose a household.')).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations).toEqual([]);
});
