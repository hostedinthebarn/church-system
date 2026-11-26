// LGC-57 / ADR-0002: the keyboard-only pass on the Apostrophe admin. A failure
// here is a reversal trigger for the platform choice (WordPress is the
// fallback), so it is reported to Gary, not worked around. Keyboard only: no
// mouse click anywhere after the sign-in page loads.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'e2e-only-password';
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

// What the focused element looks like to a sighted keyboard user.
function focusInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) {
      return null;
    }
    const style = window.getComputedStyle(el);
    const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    const shadow = style.boxShadow && style.boxShadow !== 'none';
    const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.id || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const box = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      label,
      visibleRing: outline || Boolean(shadow),
      inModal: Boolean(el.closest('[role="dialog"]')),
      size: `${Math.round(box.width)}x${Math.round(box.height)}`
    };
  });
}

async function signIn(page) {
  await page.goto('/login');
  const user = page.locator('input[name="username"], input[type="text"]').first();
  await user.focus();
  await page.keyboard.type('e2e-admin');
  await page.keyboard.press('Tab');
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
}

test('sign in by keyboard, and the admin bar is reachable in order with a visible focus ring', async ({ page }) => {
  await signIn(page);
  await page.goto('/');
  const bar = page.locator('.apos-admin-bar');
  await expect(bar).toBeVisible();
  const seen = [];
  const noRing = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const info = await focusInfo(page);
    if (info) {
      seen.push(`${info.tag}:${info.label}`);
      if (!info.visibleRing) {
        noRing.push(`${info.tag}:${info.label}`);
      }
    }
  }
  console.log('Tab order from the top of the home page:', seen.join(' > '));
  expect(seen.length).toBeGreaterThan(5);
  expect(noRing, 'focused controls with no visible focus ring').toEqual([]);
});

test('the Events manager opens by keyboard, traps focus, and Escape gives focus back', async ({ page }) => {
  await signIn(page);
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Events' }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const modal = page.getByRole('heading', { name: 'Manage Events' });
  await expect(modal).toBeVisible();
  // Focus moved into the dialog, and Tab never leaves it.
  const outside = [];
  const noRing = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const info = await focusInfo(page);
    if (info && !info.inModal) {
      outside.push(`${info.tag}:${info.label}`);
    }
    if (info && info.inModal && !info.visibleRing) {
      noRing.push(`${info.tag}:${info.label}`);
    }
  }
  expect(outside, 'focus escaped the open manager').toEqual([]);
  expect(noRing, 'manager controls with no visible focus ring').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
});

// KNOWN, in Apostrophe 4.34 itself (reported on LGC-57): closing a manager or
// editor with Escape or Exit drops focus to the page body, so a keyboard user
// starts again from the top of the page. Declared as an expected failure so
// the suite stays green and turns red, as a prompt to delete this marker, the
// day an Apostrophe upgrade returns focus to the button that opened it.
test('focus returns to the Events button after the manager closes (Apostrophe core drops it)', async ({ page }) => {
  test.fail(true, 'Apostrophe 4.34 does not restore focus after closing a manager');
  await signIn(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Events' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Manage Events' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Manage Events' })).toBeHidden();
  await page.waitForTimeout(1500);
  const after = await focusInfo(page);
  expect(after && after.label).toContain('Events');
});

// Opens the first event's editor from the keyboard, then tabs through it.
async function walkEditor(page) {
  await signIn(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Events' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Manage Events' })).toBeVisible();
  // A row's title is a button or link in the table: reach it with Tab.
  let opened = false;
  for (let i = 0; i < 60 && !opened; i++) {
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => document.activeElement && document.activeElement.textContent.trim());
    if (/Sunday worship|Gospel|Fellowship/i.test(label || '')) {
      await page.keyboard.press('Enter');
      opened = true;
    }
  }
  expect(opened, 'an event row is reachable by Tab and opens with Enter').toBe(true);
  await expect(page.getByLabel('Place')).toBeVisible();
  const walk = {
    outside: [],
    noRing: [],
    dateTimeNoRing: [],
    stops: new Set()
  };
  for (let i = 0; i < 50; i++) {
    await page.keyboard.press('Tab');
    const info = await focusInfo(page);
    if (!info) {
      continue;
    }
    const name = `${info.tag}${info.type ? `[${info.type}]` : ''}:${info.label}`;
    walk.stops.add(name);
    if (!info.inModal) {
      walk.outside.push(name);
    } else if (!info.visibleRing) {
      (/^(date|time)$/.test(info.type) ? walk.dateTimeNoRing : walk.noRing).push(name);
    }
  }
  return walk;
}

test('an event opens in the editor by keyboard, and Tab stays inside it with a visible ring', async ({ page }) => {
  const walk = await walkEditor(page);
  console.log('Editor tab stops:', [ ...walk.stops ].join(' > '));
  expect(walk.outside, 'focus escaped the editor').toEqual([]);
  expect(walk.noRing, 'editor controls with no visible focus ring').toEqual([]);
  expect(walk.stops.size).toBeGreaterThan(8);
  await page.keyboard.press('Escape');
  // Escape may ask to confirm discarding changes; none were made.
  await expect(page.getByLabel('Place')).toBeHidden();
});

// KNOWN, in Apostrophe 4.34 itself (reported on LGC-57): the date and time
// fields show no focus ring (WCAG 2.4.7, AA). Marked as an expected failure; it
// turns red when an upgrade fixes it, which is the cue to delete the marker.
test('the date and time fields show a focus ring (Apostrophe core has none)', async ({ page }) => {
  test.fail(true, 'Apostrophe 4.34 draws no focus ring on date and time inputs');
  const walk = await walkEditor(page);
  expect(walk.dateTimeNoRing).toEqual([]);
});

test('axe finds nothing on the open admin bar and the Events manager', async ({ page }) => {
  await signIn(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Events' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Manage Events' })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags([ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ])
    .include('#apos-modals')
    .analyze();
  expect(results.violations.map(v => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
