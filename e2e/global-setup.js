// Signs in the two demo people once, with the emailed-link flow and the dev
// outbox, and saves each browser session, so no test hits the sign-in rate
// limit. Runs after Playwright has started the app on the reset demo data.
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { chromium } = require('@playwright/test');
const { e2eMongoUri } = require('./mongo-uri');

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

// The admin the office specs sign in as, and the serving roles, are made once
// here, before any spec runs. Left to each spec, parallel workers raced: one
// signed in before another had finished adding the admin. A repeat run finds
// the admin already there and exits with an error, which is fine.
function seedOnce() {
  const env = { ...process.env, APOS_MONGODB_URI: e2eMongoUri() };
  spawnSync('node', [ path.join(__dirname, 'seed-admin.js') ], { env, timeout: 120_000 });
  const roles = spawnSync('node', [ path.join(__dirname, '..', 'app.js'), 'serving-role:seed' ], {
    env,
    timeout: 120_000
  });
  if (roles.status !== 0) {
    throw new Error(`serving-role:seed failed: ${roles.stderr}`);
  }
}

module.exports = async config => {
  seedOnce();
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
