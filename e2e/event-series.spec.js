// LGC-64: saving an occurrence of a repeating event in the admin editor asks
// "this one only, or this and all after?". The demo data has two open-ended
// weekly series (Sunday worship, Wednesday Bible class) and one-off events.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { MongoClient } = require('mongodb');
const { e2eMongoUri } = require('./mongo-uri');

const PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'e2e-only-password';

test.describe.configure({ mode: 'serial' });

async function drafts(title) {
  const client = await MongoClient.connect(e2eMongoUri());
  try {
    const found = await client.db().collection('aposDocs').find({
      type: '@apostrophecms/event',
      aposMode: 'draft',
      aposLocale: 'en:draft',
      title
    }).toArray();
    return found.sort((a, b) => a.start - b.start);
  } finally {
    await client.close();
  }
}

async function openEditor(page, title, nth = 0) {
  await page.goto('/login');
  await page.locator('input[name="username"], input[type="text"]').first().fill('e2e-admin');
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input[type="password"]').press('Enter');
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Events' }).first().click();
  await page.locator('#apos-modals td', { hasText: title }).nth(nth).click();
  await expect(page.getByLabel('Place')).toBeVisible();
}

const dialog = page => page.locator('.apos-confirm');
const update = page => page.locator('#apos-modals').getByRole('button', { name: 'Update', exact: true });

test('"this one only" changes one occurrence and marks it as edited on its own', async ({ page }) => {
  await openEditor(page, 'Sunday worship');
  await page.getByLabel('Place').fill('Parking lot');
  await update(page).click();
  await expect(dialog(page)).toBeVisible();
  const results = await new AxeBuilder({ page }).include('.apos-confirm').withTags([ 'wcag2a', 'wcag2aa' ]).analyze();
  expect(results.violations).toEqual([]);
  await dialog(page).getByText('This one only', { exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(async () => (await drafts('Sunday worship'))[0].place).toBe('Parking lot');
  const all = await drafts('Sunday worship');
  expect(all[0].seriesException).toBe(true);
  expect(all.slice(1).every(o => o.place !== 'Parking lot')).toBe(true);
});

test('"this and all after" changes the later occurrences and no exception is set', async ({ page }) => {
  await openEditor(page, 'Wednesday Bible class', 1);
  const before = await drafts('Wednesday Bible class');
  await page.getByLabel('Place').fill('Fellowship hall');
  await update(page).click();
  await dialog(page).getByText('This and all after', { exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Save' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(async () => {
    const list = await drafts('Wednesday Bible class');
    return list[list.length - 1].place;
  }).toBe('Fellowship hall');
  const all = await drafts('Wednesday Bible class');
  expect(all[0].place).toBe(before[0].place);
  expect(all.slice(1).every(o => o.place === 'Fellowship hall')).toBe(true);
  expect(all.some(o => o.seriesException)).toBe(false);
});

test('Cancel saves nothing and leaves the form open', async ({ page }) => {
  await openEditor(page, 'Sunday worship', 1);
  await page.getByLabel('Place').fill('Never saved');
  await update(page).click();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByLabel('Place')).toHaveValue('Never saved');
  const all = await drafts('Sunday worship');
  expect(all.every(o => o.place !== 'Never saved')).toBe(true);
});

test('an event that is not in a series saves with no prompt', async ({ page }) => {
  await openEditor(page, 'Fellowship meal');
  await page.getByLabel('Place').fill('Gym');
  await update(page).click();
  await expect.poll(async () => (await drafts('Fellowship meal'))[0].place).toBe('Gym');
  await expect(dialog(page)).toHaveCount(0);
});
