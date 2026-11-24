// The month calendar, /calendar (LGC-42), in a real browser: anonymous and
// signed in, at phone and desktop width. The demo events (lib/demo-data.js) are
// dated from today: an Elders' meeting (members only), a cancelled Singing
// night and a three-day Gospel meeting.
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const rules = require('../lib/rules.js');
const { addDays, weekdayOf } = require('@church-system/calendar-logic/src/dates.js');

const AXE_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ];
const auth = name => path.join(__dirname, '.auth', `${name}.json`);
const PHONE = {
  width: 390,
  height: 844
};
const DESKTOP = {
  width: 1280,
  height: 900
};

const today = rules.todayIso();
const sunday = addDays(today, (7 - weekdayOf(today)) % 7);
const monthOf = date => date.slice(0, 7);
const singing = addDays(sunday, 16);
const elders = addDays(sunday, 9);
const gospel = addDays(sunday, 20);
const url = month => `/calendar?month=${month}`;

async function noAxeViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

function suite(viewportName, viewport) {
  const desktop = viewportName === 'desktop';
  // The list and the grid are both in the page; the visible one is the one to read.
  const events = page => page.locator(desktop ? '.cal-grid' : '.cal-list');

  test.describe(`${viewportName}, signed out`, () => {
    test.use({ viewport });

    test('shows public events only, and only one of list and grid', async ({ page }) => {
      await page.goto(url(monthOf(singing)));
      await expect(page.getByRole('heading', { level: 1, name: 'Calendar' })).toBeVisible();
      await expect(events(page)).toContainText('Singing night');
      await expect(page.locator('main')).not.toContainText('Elders');
      await expect(page.locator(desktop ? '.cal-list' : '.cal-grid')).toBeHidden();
      await expect(page.getByRole('link', { name: 'Member sign-in' }).first()).toBeVisible();
    });

    test('a cancelled event is struck through and says Cancelled', async ({ page }) => {
      await page.goto(url(monthOf(singing)));
      const item = events(page).locator('.cal-event', { hasText: 'Singing night' }).first();
      await expect(item.locator('del')).toHaveText('Singing night');
      await expect(item).toContainText('Cancelled');
      await expect(item.locator('del')).toHaveCSS('text-decoration-line', 'line-through');
    });

    test('a multi-day event is on each of its days', async ({ page }) => {
      await page.goto(url(monthOf(gospel)));
      const days = [ gospel, addDays(gospel, 1), addDays(gospel, 2) ].filter(d => monthOf(d) === monthOf(gospel));
      await expect(events(page).getByText('Gospel meeting')).toHaveCount(days.length);
    });

    test('back, forward and Back to this month', async ({ page }) => {
      await page.goto('/calendar');
      const here = await page.locator('.cal-month').textContent();
      await page.getByRole('link', { name: 'Next month' }).click();
      await expect(page.locator('.cal-month')).not.toHaveText(here);
      await page.getByRole('link', { name: 'Previous month' }).click();
      await expect(page.locator('.cal-month')).toHaveText(here);
      await page.getByRole('link', { name: 'Previous month' }).click();
      await page.getByRole('link', { name: 'Back to this month' }).click();
      await expect(page.locator('.cal-month')).toHaveText(here);
    });

    test('the picker jumps ten years back and ten years forward', async ({ page }) => {
      const year = Number(today.slice(0, 4));
      for (const [ target, name ] of [ [ year - 10, 'March' ], [ year + 10, 'October' ] ]) {
        await page.goto('/calendar');
        await page.getByLabel('Month', { exact: true }).selectOption({ label: name });
        await page.getByLabel('Year').fill(String(target));
        await page.getByRole('button', { name: 'Go' }).click();
        await expect(page).toHaveURL(new RegExp(`month=${target}-${name === 'March' ? '03' : '10'}$`));
        await expect(page.locator('.cal-month')).toHaveText(`${name} ${target}`);
        await expect(page.getByText('No events this month.')).toBeVisible();
      }
    });

    test('today is marked in the grid', async ({ page }) => {
      test.skip(!desktop, 'the grid is the desktop view');
      await page.goto(`/calendar?month=${monthOf(today)}`);
      await expect(page.locator('td[aria-current="date"]')).toContainText(String(Number(today.slice(8))));
    });

    test('a month with events and an empty month pass axe', async ({ page }) => {
      await page.goto(url(monthOf(singing)));
      await noAxeViolations(page);
      await page.goto(url('2010-01'));
      await noAxeViolations(page);
    });
  });

  test.describe(`${viewportName}, member`, () => {
    test.use({
      viewport,
      storageState: auth('member')
    });

    test('also sees members-only events, labelled', async ({ page }) => {
      await page.goto(url(monthOf(elders)));
      const item = events(page).locator('.cal-event', { hasText: "Elders' meeting" }).first();
      await expect(item).toBeVisible();
      await expect(item).toContainText('Members');
      await expect(page.getByText('Members: sign in')).toHaveCount(0);
    });

    test('a month with events and an empty month pass axe', async ({ page }) => {
      await page.goto(url(monthOf(elders)));
      await noAxeViolations(page);
      await page.goto(url('2010-01'));
      await noAxeViolations(page);
    });
  });
}

suite('phone', PHONE);
suite('desktop', DESKTOP);

test.describe('desktop grid structure', () => {
  test.use({ viewport: DESKTOP });
  test('is a table with a caption and column headings', async ({ page }) => {
    await page.goto(url(monthOf(singing)));
    const grid = page.locator('table.cal-grid');
    await expect(grid.locator('thead th[scope="col"]')).toHaveCount(7);
    await expect(grid.getByRole('columnheader', { name: 'Sunday' })).toBeVisible();
    await expect(grid.locator('caption')).toHaveText(await page.locator('.cal-month').textContent());
  });
});

test.describe('phone list structure', () => {
  test.use({ viewport: PHONE });
  test('has a heading for each day, and the table is out of the accessibility tree', async ({ page }) => {
    await page.goto(url(monthOf(singing)));
    await expect(page.locator('.cal-list h3').first()).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
  });
});

test.describe('without JavaScript', () => {
  test.use({
    viewport: PHONE,
    javaScriptEnabled: false
  });
  test('the page and the picker still work', async ({ page }) => {
    await page.goto('/calendar');
    await page.getByLabel('Year').fill('2030');
    await page.getByLabel('Month', { exact: true }).selectOption({ label: 'June' });
    await page.getByRole('button', { name: 'Go' }).click();
    await expect(page.locator('.cal-month')).toHaveText('June 2030');
  });
});
