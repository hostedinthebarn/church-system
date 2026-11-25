# Local copy

A copy of the app on this machine, so a change can be seen in seconds instead of after CI and a deploy. It runs in Docker, as close to the POC server as a laptop allows: Linux, Node 22, MongoDB 8.0, demo mode, and no real email.

```sh
npm run dev:up       # http://localhost:3000; the first start takes a few minutes
npm run dev:down     # stop, keeping the data
npm run dev:reset    # stop and delete the data; the next start seeds a fresh demo
```

- **Admin:** `dev` at <http://localhost:3000/login>, password `dev-only-password` (or `DEV_ADMIN_PASSWORD` set before the first start).
- **Members:** sign in with a demo address (`sam.sample@example.com` for a member, `casey.office@example.com` for the office). The link lands in <http://localhost:3000/dev/outbox>; open that while signed in as `dev`.
- **Editing:** the code is mounted from this checkout. Saving a file under `modules`, `lib`, `sites` or `packages` restarts the app, and the asset build runs again on the restart, so allow a few seconds.
- **Pictures:** the demo has no logo or photos, because none are in the repo. Upload them through the admin (site settings for the logo, the home page for the hero and Latest Message pictures).
- **Bulletin PDF:** rendered with Chromium; the server uses Google Chrome, which has no Linux arm64 build.
- MongoDB answers on `localhost:27018`, so it doesn't clash with a test database on 27017.

Nothing in `dev/` is deployed: `deploy/deploy.sh` ships only the paths in its `APP_PATHS` list.
