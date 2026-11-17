// Adds the admin the browser tests sign in as, against APOS_MONGODB_URI.
// Run as `node e2e/seed-admin.js`. The user:add task asks for a password; the
// answer is injected so nothing waits on a keyboard. A second run fails with
// "duplicate username", which the caller ignores.
const prompts = require('prompts');

prompts.inject([ process.env.E2E_ADMIN_PASSWORD || 'e2e-only-password' ]);
process.argv = [ process.argv[0], require('node:path').join(__dirname, '..', 'app.js'),
  '@apostrophecms/user:add', 'e2e-admin', 'admin' ];
require('../app.js');
