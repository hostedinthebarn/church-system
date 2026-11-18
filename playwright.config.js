const { defineConfig } = require('@playwright/test');

const port = process.env.E2E_PORT || '3100';

// The browser tests reset and fill their own database (church-system-e2e), on
// the same server as APOS_MONGODB_URI, never the database that variable names.
function e2eMongoUri() {
  const base = process.env.APOS_MONGODB_URI || 'mongodb://localhost:27017/x';
  const url = new URL(base);
  url.pathname = '/church-system-e2e';
  return url.toString();
}

module.exports = defineConfig({
  testDir: 'e2e',
  // The first start builds Apostrophe's assets, which is slow.
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'line',
  globalSetup: require.resolve('./e2e/global-setup.js'),
  use: {
    baseURL: `http://localhost:${port}`,
    // GitHub's ubuntu runners ship Google Chrome, so CI needs no browser
    // download. Locally: `npx playwright install chromium`, then
    // PW_CHANNEL=chromium npm run test:e2e
    channel: process.env.PW_CHANNEL || 'chrome'
  },
  webServer: {
    command: 'node app.js',
    url: `http://localhost:${port}/`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: port,
      APOS_MONGODB_URI: e2eMongoUri(),
      // Made-up households (lib/demo-data.js), reset on every start.
      CHURCH_SEED_DEMO: 'reset',
      CHURCH_PDF_COMPRESS: '0'
    }
  }
});
