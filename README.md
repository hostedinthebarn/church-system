# church-system

An open-source church website and members area, built on [ApostropheCMS 4](https://apostrophecms.com) by Hosted in the Barn. It's written for any church; the first one is La Grange Church of Christ in La Grange, Texas, whose details live in config and a theme folder rather than in the code.

**Status:** proof of concept, running on made-up demo data. Nothing here holds real member information.

It covers a public home page and calendar, a members directory with households, groups and a servers roster, events with calendar feeds, a weekly bulletin, and a weekly task list for the church office. Volunteers can also update it by asking Claude, through the companion [apostrophe-mcp](https://github.com/hostedinthebarn/apostrophe-mcp) server.

MIT licensed. Changes reach `main` through pull requests only.

## Run it locally

You need Node 22.12 or newer and Docker (for MongoDB).

```sh
docker run -d --name church-mongo -p 27017:27017 mongo:8.0
export APOS_MONGODB_URI=mongodb://localhost:27017/church-system
npm ci
npm start          # http://localhost:3000, the first start builds the assets
```

MongoDB is the only database; the app reads its address from `APOS_MONGODB_URI`. Create the first admin with `node app @apostrophecms/user:add admin admin`, then sign in at `/login`.

Checks:

```sh
npm test           # lint, unit tests, workspace packages, then the browser tests
npm run test:unit  # fast: no database or browser needed
npm run test:db    # record types and the audit trail, needs MongoDB at APOS_MONGODB_URI
```

The browser tests (`npm run test:e2e`) start the app on port 3100 and need MongoDB plus Google Chrome. Without Chrome, run `npx playwright install chromium` and set `PW_CHANNEL=chromium`.

### How it's laid out

- `sites/la-grange/`: this church's details (`config.js`: name, service times, contact, Give link) and its theme tokens. Nothing in `modules/` names the church. To run another church, copy the folder to `sites/<name>/`, start with `CHURCH_SITE=<name>`, and point `modules/theme/ui/src/index.scss` at its theme.
- `modules/church-site/`: generic behaviour and our interface text (`i18n/church/en.json`, `es.json`).
- `modules/person`, `household`, `person-relationship`, `group`, `office-note`, `away-date`: the members-area record types (LGC-39). All are office-admin only for now. `modules/church-audit` writes every create, change and delete to its own `churchAudit` collection (office admins read it at `/api/v1/church-audit/entries`); `lib/rules.js` holds the data rules as plain functions.
- `modules/church-signin/`, `lib/signin.js`, `lib/mail.js`: sign-in by an emailed link (LGC-45). Adults who are active and have an email ask for a link at `/sign-in`; it works once and expires in 15 minutes, and asking for a new one voids the old. Minors can't sign in. A member gets an Apostrophe `guest` user, an office admin (the person's "Office admin" box) an `admin` one. Requests are rate-limited. Mail goes through one small interface with two senders: a fake one (the default) whose outbox you read at `/dev/outbox`, and Resend. A send-allowlist refuses any address not on the tester list, for both senders.
- `packages/*`: npm workspaces for the logic packages; `npm test` runs theirs too.
- Spanish (`/es`) is configured but hidden: visitors get a 404, signed-in editors can reach it. All interface text goes through `__t('church:...')`, and `test/i18n.test.js` fails on any literal text in our templates.
- The POC is noindexed everywhere (`X-Robots-Tag` and a meta tag) and every page carries a "Demo data" banner.
- In production, set `CHURCH_SESSION_SECRET`; the app refuses to start without it.
- Mail settings (environment, no secrets in the repo): `CHURCH_MAIL` (`fake`, the default, or `resend`), `CHURCH_MAIL_ALLOWLIST` (exact addresses and `@domain` entries, separated by commas or spaces; defaults to `@example.com` for the fake sender and to nothing, so everything refused, for Resend), `RESEND_API_KEY` and `CHURCH_MAIL_FROM` (Resend only). Links are built from `APOS_BASE_URL`; in production no link is sent without it. Behind a proxy, set the `trustProxy` option on `@apostrophecms/express` so the rate limit sees real client IPs.
