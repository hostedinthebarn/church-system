// The members directory in a real browser, on a phone-sized screen, signed in
// as made-up people (lib/demo-data.js; the sessions come from global-setup.js).
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const AXE_TAGS = [ 'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa' ];
const auth = name => path.join(__dirname, '.auth', `${name}.json`);

test.use({
  viewport: {
    width: 390,
    height: 844
  }
});

async function noAxeViolations(page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations).toEqual([]);
}

// Every button and link the person would tap is at least 44 by 44 points.
async function bigTargets(page) {
  const small = await page.locator('main a:visible, main button:visible, header a:visible, header button:visible')
    .evaluateAll(nodes => nodes
      .map(node => {
        const box = node.getBoundingClientRect();
        return {
          text: (node.textContent || '').trim().slice(0, 30),
          width: Math.round(box.width),
          height: Math.round(box.height),
          // Jump-to-letter rail links are a shortcut; the list is the way in.
          rail: Boolean(node.closest('.rail'))
        };
      })
      .filter(item => !item.rail && (item.height < 44 || item.width < 44)));
  expect(small).toEqual([]);
}

async function householdLink(page, name) {
  await page.goto('/members/directory?layout=a');
  return page.locator('a.hh-card', { hasText: name }).first().getAttribute('href');
}

test.describe('signed out', () => {
  test('the directory sends you to sign in', async ({ page }) => {
    await page.goto('/members/directory');
    await expect(page).toHaveURL(/\/sign-in/);
  });
  test('the PDF is not served to visitors', async ({ request }) => {
    const response = await request.get('/members/directory.pdf', { maxRedirects: 0 });
    expect(response.status()).not.toBe(200);
  });
});

test.describe('a member browsing', () => {
  test.use({ storageState: auth('other') });

  test('both layouts list households A to Z and pass axe, with big targets', async ({ page }) => {
    await page.goto('/members/directory?layout=b');
    await expect(page.getByRole('heading', { name: 'Church directory' })).toBeVisible();
    await expect(page.locator('details').first()).toBeVisible();
    await noAxeViolations(page);
    await bigTargets(page);
    await page.goto('/members/directory?layout=a');
    await expect(page.locator('a.hh-card').first()).toBeVisible();
    await noAxeViolations(page);
    await bigTargets(page);
  });

  test('search works in either layout and keeps the layout', async ({ page }) => {
    for (const layout of [ 'a', 'b' ]) {
      await page.goto(`/members/directory?layout=${layout}`);
      await page.getByLabel('Search by name, street or phone').fill('sal');
      await page.getByRole('button', { name: 'Search' }).click();
      await expect(page).toHaveURL(new RegExp(`layout=${layout}`));
      await expect(page.getByRole('status').filter({ hasText: 'households' })).toContainText('1 households');
      await expect(page.locator('main')).toContainText('Sample');
      await expect(page.locator('main')).not.toContainText('Example');
    }
  });

  test('the layout switch keeps the search', async ({ page }) => {
    await page.goto('/members/directory?layout=b&q=sample');
    await page.getByRole('link', { name: /cards/ }).click();
    await expect(page).toHaveURL(/layout=a/);
    await expect(page).toHaveURL(/q=sample/);
  });

  test('households that opted out, visitors and moved-away people are not listed', async ({ page }) => {
    await page.goto('/members/directory?layout=b');
    for (const name of [ 'Quill', 'Mock', 'Away' ]) {
      await expect(page.locator('main')).not.toContainText(name);
    }
  });

  test('a household page shows a child as name and birthday only', async ({ page }) => {
    const href = await householdLink(page, 'Sample');
    await page.goto(href);
    await expect(page.getByRole('heading', {
      name: 'Sample',
      level: 1
    })).toBeVisible();
    await expect(page.locator('main')).toContainText('Sasha Sample');
    await expect(page.locator('main')).toContainText('Name and birthday only');
    // Sasha's cellphone and Sally's hidden one never reach another member.
    await expect(page.locator('main')).not.toContainText('555-0103');
    await expect(page.locator('main')).not.toContainText('555-0102');
    await expect(page.getByRole('link', { name: 'Edit this household' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Change history' })).toHaveCount(0);
    await noAxeViolations(page);
    await bigTargets(page);
  });

  test('a hidden address stays hidden', async ({ page }) => {
    const href = await householdLink(page, 'Example');
    await page.goto(href);
    await expect(page.locator('main')).toContainText('Address not shared');
    await expect(page.locator('main')).not.toContainText('18 Example');
  });

  test('another household\'s edit page is refused', async ({ page }) => {
    const href = await householdLink(page, 'Sample');
    const response = await page.goto(`${href}/edit`);
    expect(response.status()).toBe(403);
  });

  test('a household that does not exist is not found', async ({ page }) => {
    const response = await page.goto('/members/household/not-a-real-id');
    expect(response.status()).toBe(404);
  });

  test('the PDF lists households in surname order and leaves hidden things out', async ({ page }) => {
    await page.goto('/members/directory');
    const [ download ] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: 'Download PDF' }).click()
    ]);
    expect(download.suggestedFilename()).toBe('directory.pdf');
    const fs = require('node:fs');
    const buffer = fs.readFileSync(await download.path());
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    // Uncompressed in the tests (CHURCH_PDF_COMPRESS=0): text is hex in TJ arrays.
    const text = [ ...buffer.toString('latin1').matchAll(/<([0-9a-f]+)>/gi) ]
      .map(match => Buffer.from(match[1], 'hex').toString('latin1'))
      .join('\n');
    expect(text).toContain('Sample');
    expect(text).toContain('Sasha');
    for (const left of [ 'Quill', 'Mock', 'Avery', '555-0102', '555-0103', '18 Example', 'fran.figure' ]) {
      expect(text, left).not.toContain(left);
    }
    const order = [ 'Example', 'Figure', 'Placeholder', 'Sample' ].map(name => text.indexOf(name));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([ ...order ].sort((a, b) => a - b)).toEqual(order);
  });
});

test.describe('a member editing their own household', () => {
  test.use({ storageState: auth('member') });

  test('edit form passes axe, has big targets, saves and shows the stamp', async ({ page }) => {
    await page.goto('/members/directory?layout=a');
    await page.getByRole('link', { name: 'My household' }).first().click();
    await expect(page.getByRole('link', { name: 'Edit my household' })).toBeVisible();
    await page.getByRole('link', { name: 'Edit my household' }).click();
    await expect(page.getByRole('heading', { name: /Edit the Sample.* household/ })).toBeVisible();
    await noAxeViolations(page);
    await bigTargets(page);

    // A bad answer is explained next to the field and nothing is saved.
    await page.getByLabel('Email (optional)').first().fill('nope');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert')).toContainText('need fixing');
    await expect(page.locator('.error').first()).toContainText('email address');
    await noAxeViolations(page);

    await page.getByLabel('Email (optional)').first().fill('sam.sample@example.com');
    const street = `${400 + Math.floor(Math.random() * 90)} N Sample St`;
    await page.getByLabel('Street').fill(street);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
    await expect(page.locator('main')).toContainText(street);
    await expect(page.locator('main')).toContainText('Last updated by Sample, Sam');
    await noAxeViolations(page);
  });

  test('a member cannot set the office-only fields', async ({ page }) => {
    await page.goto('/members/directory?layout=a');
    await page.getByRole('link', { name: 'My household' }).first().click();
    await page.getByRole('link', { name: 'Edit my household' }).click();
    await expect(page.getByLabel('Household name')).toHaveCount(0);
    await expect(page.getByLabel(/Status \(office only\)/)).toHaveCount(0);
  });
});

test.describe('the office', () => {
  test.use({ storageState: auth('office') });

  test('sees opted-out households when asked, and the change history', async ({ page }) => {
    await page.goto('/members/directory?layout=b');
    await expect(page.locator('main')).not.toContainText('Quill');
    await page.getByLabel('Households that opted out').check();
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('main')).toContainText('Quill');
    await expect(page.locator('main')).toContainText('Opted out');
    await noAxeViolations(page);

    await page.goto('/members/directory?layout=a&q=sample');
    await page.locator('a.hh-card', { hasText: 'Sample' }).click();
    await expect(page.getByRole('link', { name: 'Edit this household' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Change history' })).toBeVisible();
    await noAxeViolations(page);
  });

  test('can edit anyone and the change is recorded in the history', async ({ page }) => {
    await page.goto('/members/directory?layout=a&q=pam');
    await page.locator('a.hh-card', { hasText: 'Pam' }).click();
    await page.getByRole('link', { name: 'Edit this household' }).click();
    await expect(page.getByLabel('Household name')).toBeVisible();
    await expect(page.getByLabel(/Status \(office only\)/).first()).toBeVisible();
    await noAxeViolations(page);
    const phone = `(979) 555-${String(1000 + Math.floor(Math.random() * 8999))}`;
    await page.getByLabel('Home phone').fill(phone);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
    const history = page.locator('table.audit');
    await expect(history).toContainText('Demo, Casey');
    await expect(history).toContainText(phone);
    await noAxeViolations(page);
  });
});
