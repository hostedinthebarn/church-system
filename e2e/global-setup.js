// Signs in the two demo people once, with the emailed-link flow and the dev
// outbox, and saves each browser session, so no test hits the sign-in rate
// limit. Runs after Playwright has started the app on the reset demo data.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');

const AUTH_DIR = path.join(__dirname, '.auth');
const PEOPLE = {
  member: 'sam.sample@example.com',
  other: 'pat.placeholder@example.com',
  office: 'casey.office@example.com'
};

async function signIn(browser, baseURL, email, file) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send me a link' }).click();
  await page.getByRole('status').waitFor();
  await page.goto('/dev/outbox');
  const link = page.locator('li', { hasText: email }).first().getByRole('link');
  await link.click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(url => url.pathname === '/');
  await context.storageState({ path: file });
  await context.close();
}

module.exports = async config => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const baseURL = config.projects[0].use.baseURL;
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome' });
  try {
    for (const [ name, email ] of Object.entries(PEOPLE)) {
      await signIn(browser, baseURL, email, path.join(AUTH_DIR, `${name}.json`));
    }
  } finally {
    await browser.close();
  }
};
