const { defineConfig } = require('@playwright/test');
const { e2eMongoUri } = require('./e2e/mongo-uri');

const port = process.env.E2E_PORT || '3100';

module.exports = defineConfig({
  testDir: 'e2e',
  // The first start builds Apostrophe's assets, which is slow.
  timeout: 60_000,
  // Each browser brings many threads. Four at once go past the 512-process limit
  // of the container our agents test in, so outside CI they run one at a time.
  workers: process.env.CI ? undefined : 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'line',
  globalSetup: require.resolve('./e2e/global-setup.js'),
  globalTeardown: require.resolve('./e2e/global-teardown.js'),
  use: {
    baseURL: `http://localhost:${port}`,
    // GitHub's ubuntu runners ship Google Chrome, so CI needs no browser
    // download. Locally: `npx playwright install chromium`, then
    // PW_CHANNEL=chromium npm run test:e2e
    channel: process.env.PW_CHANNEL || 'chrome'
  },
  webServer: {
    // The log is kept so the teardown can fail the run on server-side errors.
    command: 'node app.js 2>&1 | tee e2e/.server.log',
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
