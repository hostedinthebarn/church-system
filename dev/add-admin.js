// Adds the local admin, "dev", for the copy in dev/compose.yml. The user:add
// task asks for a password; the answer is injected so nothing waits on a
// keyboard. Local only: the password is DEV_ADMIN_PASSWORD, never a real one.
const path = require('node:path');
const prompts = require('prompts');

prompts.inject([ process.env.DEV_ADMIN_PASSWORD || 'dev-only-password' ]);
process.argv = [ process.argv[0], path.join(__dirname, '..', 'app.js'), '@apostrophecms/user:add', 'dev', 'admin' ];
require('../app.js');
