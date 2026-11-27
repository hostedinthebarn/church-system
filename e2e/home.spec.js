// The public home page (LGC-33) in a real browser: sign-in beside the menu
// button on a phone, the menu by keyboard, the live events list and axe at
// phone width, the open menu, 320 px (200% zoom of a 640 px window) and desktop.
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const AXE_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ];
const auth = name => path.join(__dirname, '.auth', `${name}.json`);

async function noAxeViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test.describe('phone, signed out', () => {
  test.use({
    viewport: {
      width: 375,
      height: 800
    }
  });

  test('Member sign-in is beside the menu button, above the fold, without opening the menu', async ({ page }) => {
    await page.goto('/');
    const signIn = page.locator('.site-header-actions').getByRole('link', { name: 'Member sign-in' });
    const menu = page.getByRole('button', { name: 'Menu' });
    await expect(signIn).toBeVisible();
    await expect(menu).toBeVisible();
    const a = await signIn.boundingBox();
    const b = await menu.boundingBox();
    expect(a.y + a.height).toBeLessThan(800);
    expect(Math.abs(a.y - b.y)).toBeLessThan(a.height);
    expect(a.height).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('#main-nav')).toBeHidden();
  });

  test('the menu opens and closes by keyboard and lists the links', async ({ page }) => {
    await page.goto('/');
    const menu = page.getByRole('button', { name: 'Menu' });
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link')).toHaveText([
      'Home', 'Calendar', /^Ministries/, /^Media/, /^About Us/, /^Contact/, 'Give', 'Member sign-in'
    ]);
    await noAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).toBeHidden();
    await expect(menu).toBeFocused();
  });

  test('the home page has the hero, events with their three links, mission and sign-up', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Love God');
    const events = page.locator('[data-upcoming-events]');
    await expect(events.getByRole('heading', { name: 'Upcoming events' })).toBeVisible();
    // The demo data's cancelled Singing night and members-only Elders' meeting stay out.
    await expect(events).not.toContainText('Elders');
    await expect(events).not.toContainText('Singing night');
    await expect(events.getByRole('link', { name: 'See the full calendar' })).toHaveAttribute('href', '/calendar');
    await expect(events.getByRole('link', { name: /Subscribe on your phone/ })).toHaveAttribute('href', /^webcal:.*\/calendar\/public\.ics$/);
    await expect(events.getByRole('link', { name: /Add to Google Calendar/ })).toHaveAttribute('href', /^https:\/\/calendar\.google\.com\/calendar\/r\?cid=webcal/);
    await expect(page.getByRole('link', { name: /Sign up for the email list/ })).toHaveAttribute('href', /^https:\/\/[a-z0-9.-]+\.list-manage\.com\//);
    await expect(page.getByRole('heading', { level: 3 })).not.toHaveCount(0);
    await expect(page.locator('footer')).toContainText('Wednesday Bible class');
  });

  test('has no axe violations', async ({ page }) => {
    await page.goto('/');
    await noAxeViolations(page);
  });
});

test('parity with the current site (LGC-100): four quick links, full mission, Be Together band', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const quick = page.locator('.home-quick a');
  await expect(quick).toHaveText([ /Location & Times/, /iTunes Podcast/, /Calendar/, /Send a message/ ]);
  // The mission paragraph and the quick links are on the first screen.
  for (const loc of [ page.locator('.home-intro'), quick.first() ]) {
    const box = await loc.boundingBox();
    expect(box.y + box.height).toBeLessThan(900);
  }
  await expect(page.locator('.home-card')).toHaveCount(4);
  await expect(page.locator('.home-card').nth(3)).toContainText('leave our mark on the places where we live');
  const together = page.locator('.home-together');
  await expect(together.getByRole('heading', { name: 'Be Together, Serve Together' })).toBeVisible();
  await expect(together.locator('li')).toHaveCount(4);
  await expect(together.getByRole('link', { name: 'Contact Us' })).toBeVisible();
  await noAxeViolations(page);
});

test('the option 1 look: wave and icons are decoration, Latest Message has its art panel (LGC-83)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.locator('.home-wave')).toHaveAttribute('aria-hidden', 'true');
  const icons = page.locator('.home-quick svg');
  expect(await icons.count()).toBeGreaterThanOrEqual(2);
  for (const icon of await icons.all()) {
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
  }
  // A picture if one is uploaded, otherwise the verse on the beige panel.
  await expect(page.locator('.home-latest-art img, .home-latest-art .home-quote')).toHaveCount(1);
  // Desktop: one header row, the menu's own sign-in hidden
  // because the sign-in button sits beside it.
  const give = page.locator('#main-nav .nav-give a');
  const signIn = page.locator('.site-header-actions .church-signin');
  await expect(give).toBeVisible();
  await expect(page.locator('#main-nav .nav-signin')).toBeHidden();
  const a = await give.boundingBox();
  const b = await signIn.boundingBox();
  expect(Math.abs((a.y + a.height / 2) - (b.y + b.height / 2))).toBeLessThan(12);
  await noAxeViolations(page);
});

test.describe('320 px (200% zoom)', () => {
  test.use({
    viewport: {
      width: 320,
      height: 640
    }
  });
  test('no horizontal scroll and no axe violations', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await noAxeViolations(page);
  });
});

test.describe('desktop', () => {
  test.use({
    viewport: {
      width: 1280,
      height: 900
    }
  });
  test('the menu is open as a row and there is no menu button; no axe violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await noAxeViolations(page);
  });
  test('/calendar and /members: calendar is public, members asks for sign-in', async ({ page }) => {
    const calendar = await page.goto('/calendar');
    expect(calendar.status()).toBe(200);
    expect(calendar.headers()['x-robots-tag']).toContain('noindex');
    await page.goto('/members');
    await expect(page).toHaveURL(/\/sign-in/);
  });
  test('robots.txt disallows everything', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(await res.text()).toContain('Disallow: /');
  });
});

test.describe('signed in', () => {
  test.use({
    storageState: auth('member'),
    viewport: {
      width: 375,
      height: 800
    }
  });
  test('the header has Sign out beside the menu button', async ({ page }) => {
    await page.goto('/');
    const signOut = page.locator('.site-header-actions').getByRole('button', { name: 'Sign out' });
    const menu = page.getByRole('button', { name: 'Menu' });
    await expect(signOut).toBeVisible();
    const a = await signOut.boundingBox();
    const b = await menu.boundingBox();
    expect(Math.abs(a.y - b.y)).toBeLessThan(a.height);
    await expect(page.getByRole('link', { name: 'Member sign-in' })).toHaveCount(0);
    await noAxeViolations(page);
  });
});

test.describe('the office at desktop width', () => {
  test.use({ storageState: auth('office'), viewport: { width: 1280, height: 800 } });
  test('the toolbar is two rows: the members pages, then the office', async ({ page }) => {
    await page.goto('/members/directory');
    const rows = page.locator('.member-toolbar .member-toolbar-inner');
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) {
      const tops = await row.locator('li a').evaluateAll(links => [ ...new Set(links.map(l => Math.round(l.getBoundingClientRect().top))) ]);
      expect(tops.length, 'each toolbar row fits on one line').toBe(1);
    }
    await expect(page.locator('.site-header-actions .header-who')).toContainText('Casey');
    await noAxeViolations(page);
  });
});
