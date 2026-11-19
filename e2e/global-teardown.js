// Fails the run if the app logged a server-side template error while the
// tests ran. Playwright can't fail a test on webServer output, so the server's
// output is teed to e2e/.server.log (playwright.config.js) and read here.
const fs = require('node:fs');
const path = require('node:path');

const LOG = path.join(__dirname, '.server.log');
const PATTERN = /template not found|template render error|Template render error/i;

module.exports = async () => {
  let log;
  try {
    log = fs.readFileSync(LOG, 'utf8');
  } catch (e) {
    // Reusing a server that was already running leaves no log: nothing to check.
    return;
  }
  const hits = log.split('\n').filter(line => PATTERN.test(line));
  if (hits.length) {
    throw new Error(`The server logged template errors during the e2e run:\n${hits.join('\n')}`);
  }
};
