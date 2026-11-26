// The first-sign-in privacy screen (LGC-85). Riley Test is an adult demo
// member whom no other spec signs in as, and the seed leaves Riley "not seen",
// so this is Riley's first visit to the members area.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const AXE_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ];
const EMAIL = 'riley.test@example.com';

async function signInAsRiley(browser, baseURL) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(EMAIL);
  await page.getByRole('button', { name: 'Send me a link' }).click();
  const outbox = await context.newPage();
  await outbox.goto('/dev/outbox');
  const text = await outbox.locator('li', { hasText: EMAIL }).first().locator('pre').innerText();
  await outbox.close();
  await page.goto(/https?:\/\/\S+/.exec(text)[0]);
  await page.waitForURL(url => url.pathname === '/');
  return { context, page };
}

test('a member sees the privacy screen once, before the directory, and their choice sticks', async ({ browser, baseURL }) => {
  const { context, page } = await signInAsRiley(browser, baseURL);

  // Any members page sends them to the privacy screen first.
  await page.goto('/members/directory');
  await expect(page).toHaveURL(/\/members\/privacy\?next=%2Fmembers%2Fdirectory/);
  await expect(page.getByRole('heading', { name: 'Your privacy in the directory' })).toBeVisible();
  await expect(page.getByLabel(/Hide my email\s*riley\.test@example\.com/)).not.toBeChecked();
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations).toEqual([]);

  // Hide the email: back to where they were going.
  await page.getByLabel(/Hide my email/).check();
  await page.getByRole('button', { name: 'Save my choices' }).click();
  await expect(page).toHaveURL(/\/members\/directory$/);

  // Never again, and the choice is saved.
  await page.goto('/members/directory');
  await expect(page).toHaveURL(/\/members\/directory$/);
  await page.goto('/members/privacy');
  await expect(page).toHaveURL(/\/members\/directory$/);
  await context.close();
});

test('the office never sees it', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: 'e2e/.auth/office.json' });
  const page = await context.newPage();
  await page.goto('/members/directory');
  await expect(page).toHaveURL(/\/members\/directory$/);
  await context.close();
});
