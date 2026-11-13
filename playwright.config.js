const { defineConfig } = require('@playwright/test');

const port = process.env.E2E_PORT || '3100';

module.exports = defineConfig({
  testDir: 'e2e',
  // The first start builds Apostrophe's assets, which is slow.
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'line',
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
      APOS_MONGODB_URI: process.env.APOS_MONGODB_URI || 'mongodb://localhost:27017/church-system-e2e'
    }
  }
});
