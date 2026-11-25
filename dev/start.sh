#!/bin/sh
# Runs inside the app container (dev/compose.yml). Installs packages when the
# lock file changes, fills an empty database with the full demo, adds the
# local admin, then runs the app and restarts it when the code changes.
set -e
cd /app
if ! cmp -s package-lock.json node_modules/.dev-lock 2>/dev/null; then
  npm ci
  cp package-lock.json node_modules/.dev-lock
fi
npx playwright install chromium
# Both are safe to repeat: the seed skips a database that has households, and
# a second admin add fails on the duplicate name.
node app.js church-demo:seed
node dev/add-admin.js >/dev/null 2>&1 || true
exec node --watch-path=app.js --watch-path=modules --watch-path=lib --watch-path=sites --watch-path=packages app.js
