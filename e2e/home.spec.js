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

  test('the menu opens and closes by keyboard and lists the five links', async ({ page }) => {
    await page.goto('/');
    const menu = page.getByRole('button', { name: 'Menu' });
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link')).toHaveText([
      'Home', 'Calendar', 'Give', 'Member sign-in', 'Visit our current website'
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
    await expect(events.getByRole('link', { name: /Add to Google Calendar/ })).toHaveAttribute('href', /calendar\.google\.com/);
    await expect(page.getByRole('link', { name: /Sign up for the email list/ })).toHaveAttribute('href', /list-manage\.com/);
    await expect(page.getByRole('heading', { level: 3 })).not.toHaveCount(0);
    await expect(page.locator('footer')).toContainText('Wednesday Bible class');
  });

  test('has no axe violations', async ({ page }) => {
    await page.goto('/');
    await noAxeViolations(page);
  });
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
  test('the header says Members area, beside the menu button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.site-header-actions').getByRole('link', { name: 'Members area' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Member sign-in' })).toHaveCount(0);
    await noAxeViolations(page);
  });
});
