// Runs `npm test` in every workspace under packages/*. Plain `npm test
// --workspaces` errors out when there are none yet, so check first.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const dir = path.join(__dirname, '..', 'packages');
const found = fs.existsSync(dir) &&
  fs.readdirSync(dir).some(name => fs.existsSync(path.join(dir, name, 'package.json')));

if (!found) {
  // eslint-disable-next-line no-console
  console.log('No workspace packages yet; nothing to run.');
  process.exit(0);
}
const result = spawnSync('npm', [ 'test', '--workspaces', '--if-present' ], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
