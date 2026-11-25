// Link plus code (LGC-94, the Hosted in the Barn standard ADR-0002): the link's
// page signs in by itself, a scanner's plain fetch doesn't spend it, and the
// code signs in the tab that asked. Uses the office person, whom no stored
// session belongs to, so the other specs' sessions are untouched.
const { test, expect } = require('@playwright/test');

const EMAIL = 'casey.office@example.com';

async function ask(page) {
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(EMAIL);
  await page.getByRole('button', { name: 'Send me a link' }).click();
  await expect(page.getByRole('status')).toContainText('type its code');
}

async function latest(context) {
  const page = await context.newPage();
  await page.goto('/dev/outbox');
  const item = page.locator('li', { hasText: EMAIL }).first();
  const text = await item.locator('pre').innerText();
  await page.close();
  return {
    link: /https?:\/\/\S+/.exec(text)[0],
    code: /code on the sign-in page: (\d{3} \d{3})/.exec(text)[1]
  };
}

test.describe.configure({ mode: 'serial' });

test('the code signs in the tab that asked', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await ask(page);
  const { code } = await latest(context);
  await page.getByLabel('Code from the email').fill(code === '000 000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Sign in with the code' }).click();
  await expect(page.getByRole('alert')).toContainText('That code did not work');
  await page.getByLabel('Code from the email').fill(code);
  await page.getByRole('button', { name: 'Sign in with the code' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.site-header-actions')).toContainText('Casey');
  await context.close();
});

test('a scanner fetching the link does not spend it; opening it signs in at once', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await ask(page);
  const { link } = await latest(context);
  // What a mail scanner does: fetch the page, run nothing.
  const scanned = await page.request.get(link);
  expect(scanned.status()).toBe(200);
  await page.goto(link);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.site-header-actions')).toContainText('Casey');
  await context.close();
});
