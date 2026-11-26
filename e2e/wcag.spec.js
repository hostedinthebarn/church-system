// LGC-57: WCAG 2.2 AA with axe on every public, member and office page, at
// 1280 px, 640 px (200% zoom of a 1280 px window) and 320 px (400%, the reflow
// width). Pages are reached through the demo people in the test app, never the
// live site. Axe finds only part of the problems (about a third); the keyboard
// and screen-reader passes are separate.
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const AXE_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ];
const auth = name => path.join(__dirname, '.auth', `${name}.json`);
const WIDTHS = [
  { name: '1280 px', width: 1280, height: 900 },
  { name: '200% zoom (640 px)', width: 640, height: 900 },
  { name: '320 px', width: 320, height: 800 }
];

const PUBLIC = [ '/', '/calendar', '/events/sunday-worship', '/sign-in', '/sign-in/verify?token=not-a-real-token', '/definitely-missing' ];
const MEMBER = [ '/members/directory?layout=a', '/members/directory?layout=b', '/calendar/subscribe', '/away', '/calendar' ];
const OFFICE = [
  '/roster', '/bulletin', '/tasks', '/tasks/template', '/away', '/members/directory'
];

async function check(page, route, size) {
  await page.setViewportSize({ width: size.width, height: size.height });
  const response = await page.goto(route);
  expect(response.status(), route).toBeLessThan(500);
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`), `${route} at ${size.name}`).toEqual([]);
  // Reflow (1.4.10): nothing makes the page scroll sideways at 320 px.
  if (size.width === 320) {
    // Apostrophe's own admin bar (shown to admins) is core UI and is judged in
    // the admin pass, not here: it is wider than a phone by design.
    const overflow = await page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      let widest = 0;
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('[class*="apos-"], [data-apos-admin-bar], #apos-admin-bar, [hidden]')) {
          continue;
        }
        // Inside a region that scrolls on its own (a wide table) is allowed.
        let clipped = false;
        for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
          if ([ 'auto', 'scroll', 'hidden' ].includes(window.getComputedStyle(up).overflowX)) {
            clipped = true;
          }
        }
        if (clipped) {
          continue;
        }
        const box = el.getBoundingClientRect();
        if (box.width > 0 && window.getComputedStyle(el).position !== 'fixed') {
          widest = Math.max(widest, box.right - width);
        }
      }
      return Math.ceil(widest);
    });
    expect(overflow, `${route} scrolls sideways at 320 px`).toBeLessThanOrEqual(0);
  }
}

function suite(title, routes, state) {
  test.describe(title, () => {
    if (state) {
      test.use({ storageState: auth(state) });
    }
    for (const route of routes) {
      for (const size of WIDTHS) {
        test(`${route} at ${size.name}`, async ({ page }) => check(page, route, size));
      }
    }
  });
}

suite('public pages', PUBLIC);
suite('member pages', MEMBER, 'member');
suite('office pages', OFFICE, 'office');

test.describe('states', () => {
  test('the sign-in page after asking for a link, with its code box', async ({ page }) => {
    // One link request only: the sign-in limit is ten per address across the
    // whole e2e run, so the page is resized rather than asked again.
    await page.setViewportSize({ width: WIDTHS[0].width, height: WIDTHS[0].height });
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill('sam.sample@example.com');
    await page.getByRole('button', { name: 'Send me a link' }).click();
    await expect(page.getByLabel('Code from the email')).toBeVisible();
    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      let results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations, `code box at ${size.name}`).toEqual([]);
      // And after a wrong code: the error is announced and tied to the field.
      await page.getByLabel('Code from the email').fill('000000');
      await page.getByRole('button', { name: 'Sign in with the code' }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations, `wrong code at ${size.name}`).toEqual([]);
    }
  });

  test.describe('member household and the office pages that need an id', () => {
    test.use({ storageState: auth('office') });
    test('a household, its edit form, a roster month and a bulletin', async ({ page }) => {
      await page.goto('/members/directory');
      const household = await page.locator('a[href*="/members/household/"]').first().getAttribute('href');
      const month = new Date().toISOString().slice(0, 7);
      for (const size of WIDTHS) {
        for (const route of [ household, `${household}/edit`, `/roster/${month}`, '/bulletin/this-week' ]) {
          await check(page, route, size);
        }
      }
    });
  });
});
