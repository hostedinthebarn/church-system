const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const AXE_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ];
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'e2e-only-password';

test.describe.configure({ mode: 'serial' });

async function signIn(page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[name="username"]').first().fill('e2e-admin');
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input[type="password"]').press('Enter');
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}

test('the tasks screens are for the office only', async ({ request }) => {
  for (const url of [ '/tasks', '/tasks/template', '/tasks/week/2026-11-16' ]) {
    expect((await request.get(url)).status(), url).toBe(404);
  }
  const post = await request.post('/tasks/tick', { data: {} });
  expect(post.status()).toBeGreaterThanOrEqual(400);
});

test('this week: the template is there, add a one-off, tick it', async ({ page }) => {
  await signIn(page);
  await page.goto('/tasks');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Weekly tasks');
  await expect(page.locator('[data-tasks]')).toContainText('Build the bulletin');
  const title = `Order tags ${Date.now()}`;
  await page.getByLabel('Task', { exact: true }).fill(title);
  await page.getByLabel('Day').selectOption('friday');
  await page.getByRole('button', { name: 'Add task' }).click();
  const row = page.locator('.task-card', { hasText: title });
  await expect(row).toBeVisible();
  // One card per task: a real checkbox labelled with the task, an owner select
  // labelled for it, and the due day in words.
  await expect(row.getByText('Due Fri,')).toBeVisible();
  await expect(row.getByLabel(`Owner of ${title}`)).toBeVisible();
  await row.getByRole('checkbox', { name: title }).check();
  // Done tasks fold away under "Done this week (n)".
  const done = page.locator('details.done-tasks');
  await expect(done.locator('summary')).toContainText('Done this week');
  await expect(page.locator('.task-card', { hasText: title })).toHaveCount(0);
  await done.locator('summary').click();
  await expect(done.locator('li', { hasText: title })).toContainText('Done by');
});

test('the tasks screens have no axe violations', async ({ page }) => {
  await signIn(page);
  for (const url of [ '/tasks', '/tasks/template' ]) {
    await page.goto(url);
    await expect(page.locator('[data-tasks]')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(results.violations, url).toEqual([]);
  }
});

test('a future week is not found', async ({ page }) => {
  await signIn(page);
  expect((await page.goto('/tasks/week/2099-01-04')).status()).toBe(404);
});
