const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const AXE_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ];

// The demo events are dated from today (lib/demo-data.js): the elders' meeting
// (members-only) falls 9 days after the coming Sunday and the fellowship meal 13
// days after it, so the Sunday a week after that one has both in its two weeks.
function sundayAfterNext() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const day = new Date(`${today}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + (7 - day.getUTCDay()) % 7 + 7);
  return day;
}
const iso = (day, plus = 0) => new Date(day.getTime() + plus * 86400000).toISOString().slice(0, 10);
const DATE = iso(sundayAfterNext());
const OTHER = iso(sundayAfterNext(), 7);
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'e2e-only-password';

test.describe.configure({ mode: 'serial' });

async function signIn(page) {
  await page.goto('/login');
  await page.locator('input[type="text"], input[name="username"]').first().fill('e2e-admin');
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input[type="password"]').press('Enter');
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}

async function save(page, date, text) {
  if (!page.url().endsWith(`/bulletin/${date}/edit`)) {
    await page.goto(`/bulletin/${date}/edit`);
  }
  await page.locator('#hand-announcements').fill(text);
  const saved = page.waitForResponse(r => r.url().endsWith(`/bulletin/${date}/save`) && r.ok());
  await page.getByRole('button', { name: 'Save' }).click();
  await saved;
  // A fresh load, so the box shows what the server stored, not what was typed.
  await page.goto(`/bulletin/${date}/edit`);
  await expect(page.locator('#hand-announcements')).toHaveValue(text);
}

test('the screens are for the office; the public sees only a signed-off week', async ({ request }) => {
  for (const suffix of [ '/edit', '/print', '/pdf' ]) {
    const response = await request.get(`/bulletin/${DATE}${suffix}`);
    expect(response.status(), suffix).toBe(404);
  }
  const post = await request.post(`/bulletin/${DATE}/save`, { data: {} });
  expect(post.status()).toBeGreaterThanOrEqual(400);
  expect((await request.get('/bulletin/not-a-date')).status()).toBe(404);
  // A week nobody has saved is not found.
  expect((await request.get(`/bulletin/${iso(sundayAfterNext(), 70)}`)).status()).toBe(404);
});

test('edit screen: fill, save, overflow signal, sign-off rule', async ({ page }) => {
  await signIn(page);
  await page.goto(`/bulletin/${DATE}/edit`);
  // Start from the defaults whatever an earlier run left behind.
  await page.getByLabel('Members-only: put it in the bulletin').uncheck();
  await save(page, DATE, 'Collection today.\n- Thank you for VBS');
  await expect(page.locator('[data-bulletin-status]')).toHaveText('Draft');

  // Roster and calendar are filled in; the members-only event is not there.
  const preview = page.locator('.preview');
  await expect(preview.locator('[data-section="serving"]')).toContainText('Pat Example');
  await expect(preview.locator('[data-section="serving"]')).toContainText('unfilled');
  await expect(preview.locator('[data-section="calendar"]')).toContainText('Fellowship meal');
  await expect(preview.locator('[data-section="calendar"]')).toContainText('CANCELLED');
  await expect(preview.locator('[data-section="calendar"]')).not.toContainText('Elders\' meeting');
  await expect(preview.locator('[data-section="birthdays"]')).toHaveCount(0);

  // Panels fit.
  await expect(page.locator('[data-overflow-status] li').first()).toBeVisible();
  const fits = await page.evaluate(() => window.__bulletinOverflow);
  expect(fits.every(item => item.lines === 0)).toBe(true);

  // Tick the members-only event: it appears after saving.
  await page.getByLabel('Members-only: put it in the bulletin').check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(preview.locator('[data-section="calendar"]')).toContainText('Elders\' meeting');

  // Too much text: the panel is flagged and sign-off is refused.
  const long = Array.from({ length: 80 }, (_, i) => `Announcement line number ${i} with some words`).join('\n\n');
  await page.locator('#hand-announcements').fill(long);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#hand-announcements')).toHaveValue(long);
  await expect(page.locator('[data-panel="left"]')).toHaveAttribute('data-overflow', 'true');
  await expect(page.locator('[data-overflow-status]')).toContainText(/left: full by \d+ lines?/);
  await page.getByRole('button', { name: 'Sign off', exact: true }).click();
  await expect(page.locator('[data-message]')).toContainText('Full: left');
  await expect(page.locator('[data-bulletin-status]')).toHaveText('Draft');

  // Back to a text that fits: sign-off works, then printed.
  await page.locator('#hand-announcements').fill('Collection today.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#hand-announcements')).toHaveValue('Collection today.');
  await page.getByRole('button', { name: 'Sign off', exact: true }).click();
  await expect(page.locator('[data-bulletin-status]')).toHaveText('Signed off');
  await page.getByRole('button', { name: 'Mark as printed' }).click();
  await expect(page.locator('[data-bulletin-status]')).toHaveText('Printed');
});

test('edit screen has no axe violations', async ({ page }) => {
  await signIn(page);
  await page.goto(`/bulletin/${DATE}/edit`);
  await expect(page.locator('[data-overflow-status] li').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});

test('website page: a signed-off week is public, without the prayer list or members-only events', async ({ page, request, browser }) => {
  await signIn(page);
  await page.goto(`/bulletin/${DATE}/edit`);
  await page.locator('#hand-prayerRequests').fill('Zed Prayer in hospital');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#hand-prayerRequests')).toHaveValue('Zed Prayer in hospital');
  await page.getByLabel('Members-only: put it in the bulletin').check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.preview [data-section="prayer"]')).toContainText('Zed Prayer');
  await expect(page.locator('.preview [data-section="calendar"]')).toContainText('Elders\' meeting');
  await page.getByRole('button', { name: 'Sign off', exact: true }).click();
  await expect(page.locator('[data-bulletin-status]')).toHaveText('Signed off');

  const response = await request.get(`/bulletin/${DATE}`);
  expect(response.status()).toBe(200);
  expect(response.headers()['x-robots-tag']).toContain('noindex');
  const html = await response.text();
  expect(html).not.toContain('Prayer List');
  expect(html).not.toContain('Zed Prayer');
  expect(html).not.toContain('Elders\' meeting');
  expect(html).toContain('Fellowship meal');
  expect(html).toContain('data-demo-banner');

  const anon = await (await browser.newContext({ baseURL: test.info().project.use.baseURL })).newPage();
  await anon.goto(`/bulletin/${DATE}`);
  await expect(anon.getByRole('heading', { level: 1 })).toContainText(new Date(`${DATE}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
  }));
  const results = await new AxeBuilder({ page: anon }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
  await anon.context().close();
});

test('a draft week is not public', async ({ page, request }) => {
  await signIn(page);
  await save(page, OTHER, 'Next week');
  expect((await request.get(`/bulletin/${OTHER}`)).status()).toBe(404);
});

test('print page and PDF are two 14 x 8.5 in pages', async ({ page }) => {
  await signIn(page);
  await page.goto(`/bulletin/${DATE}/print`);
  await expect(page.locator('[data-page]')).toHaveCount(2);
  await expect(page.locator('[data-panel]')).toHaveCount(6);
  const size = await page.evaluate(() => {
    const el = document.querySelector('[data-page="outside"]');
    return [ el.offsetWidth, el.offsetHeight ];
  });
  expect(size).toEqual([ 1344, 816 ]);
  // The reading order in the markup differs from the visual order.
  const order = await page.locator('[data-page="outside"] [data-panel]').evaluateAll(
    els => els.map(el => el.getAttribute('data-panel')));
  expect(order).toEqual([ 'cover', 'flap', 'back' ]);
  const x = await page.locator('[data-panel="flap"]').evaluate(el => el.getBoundingClientRect().x);
  const cover = await page.locator('[data-panel="cover"]').evaluate(el => el.getBoundingClientRect().x);
  expect(x).toBeLessThan(cover);

  const response = await page.request.get(`/bulletin/${DATE}/pdf`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  const body = await response.body();
  expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  const text = body.toString('latin1');
  expect((text.match(/\/Type\s*\/Page[^s]/g) || []).length).toBe(2);
  expect((text.match(/\/MediaBox\s*\[\s*0\s+0\s+1008\s+612\s*\]/g) || []).length).toBe(2);
});

test('the office finds the bulletin: list, this week, links, no admin-bar entry', async ({ page, request }) => {
  // Nobody else sees the list or the shortcut.
  expect((await request.get('/bulletin', { maxRedirects: 0 })).status()).toBe(404);
  expect((await request.get('/bulletin/this-week', { maxRedirects: 0 })).status()).toBe(404);

  await signIn(page);
  const thisWeek = iso(new Date(sundayAfterNext().getTime() - 7 * 86400000));

  // The members' toolbar links straight to this week's edit screen; the public
  // menu carries no office pages.
  await page.goto('/');
  await expect(page.locator('#main-nav').getByRole('link', { name: 'This week\'s bulletin' })).toHaveCount(0);
  await page.locator('.member-toolbar').getByRole('link', { name: 'This week\'s bulletin' }).click();
  await expect(page).toHaveURL(new RegExp(`/bulletin/${thisWeek}/edit$`));
  await expect(page.getByRole('button', { name: 'Sign off' })).toBeVisible();
  // The edit screen has a way back.
  await expect(page.getByRole('link', { name: /All bulletins/ })).toHaveAttribute('href', '/bulletin');

  // The list shows nine Sundays with this week marked, and links to each.
  await page.goto('/bulletin');
  await expect(page.locator('tbody tr')).toHaveCount(9);
  const current = page.locator('tr.this-week');
  await expect(current.locator(`time[datetime="${thisWeek}"]`)).toHaveCount(1);
  await expect(current).not.toContainText(thisWeek); // shown as a readable date, not ISO
  await current.getByRole('link', { name: /Open|Start/ }).click();
  await expect(page).toHaveURL(new RegExp(`/bulletin/${thisWeek}/edit$`));

  // Apostrophe's generic Bulletins manager, whose Publish cannot work, is gone.
  await page.goto('/');
  await expect(page.locator('#apos-admin-bar')).toBeVisible();
  await expect(page.locator('#apos-admin-bar').getByText('Bulletins', { exact: true })).toHaveCount(0);
  // The office keeps Pages, Events and Images; our own screens' types are gone.
  const bar = page.locator('#apos-admin-bar');
  for (const gone of [ 'People', 'Households', 'Rosters', 'Away dates', 'Users' ]) {
    await expect(bar.getByText(gone, { exact: true })).toHaveCount(0);
  }
  for (const kept of [ 'Pages', 'Events', 'Images', 'Church setup' ]) {
    await expect(bar.getByText(kept, { exact: true }).first()).toBeVisible();
  }

  const results = await new AxeBuilder({ page: await (async () => { await page.goto('/bulletin'); return page; })() }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
});
