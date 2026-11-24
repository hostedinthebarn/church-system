# church-system

An open-source church website and members area, built on [ApostropheCMS 4](https://apostrophecms.com) by Hosted in the Barn. It's written for any church; the first one is La Grange Church of Christ in La Grange, Texas, whose details live in config and a theme folder rather than in the code.

**Status:** proof of concept, running on made-up demo data. Nothing here holds real member information.

It covers a public home page and calendar, a members directory with households, groups and a servers roster, events with calendar feeds, a weekly bulletin, and a weekly task list for the church office. Volunteers can also update it by asking Claude, through the companion [apostrophe-mcp](https://github.com/hostedinthebarn/apostrophe-mcp) server.

MIT licensed; the fonts (Jost, Inter) are OFL, see THIRD-PARTY-NOTICES.md. The church's logo is never in this repo: the office uploads it in the site settings. Changes reach `main` through pull requests only.

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

The browser tests (`npm run test:e2e`) start the app on port 3100 and need MongoDB plus Google Chrome. They use their own database, `church-system-e2e`, on the same MongoDB server, and reset it to the made-up demo households on every start; they never touch the database `APOS_MONGODB_URI` names. Playwright runs one worker unless `CI` is set; set `PW_WORKERS=1` to force one worker where `CI` is set but processes are limited (an agent container). Without Chrome, run `npx playwright install chromium` and set `PW_CHANNEL=chromium`.

### How it's laid out

- `sites/la-grange/`: this church's details (`config.js`: name, service times, contact, Give link) and its theme tokens. Nothing in `modules/` names the church. To run another church, copy the folder to `sites/<name>/`, start with `CHURCH_SITE=<name>`, and point `modules/theme/ui/src/index.scss` at its theme.
- `modules/church-site/`: generic behaviour and our interface text (`i18n/church/en.json`, `es.json`).
- `modules/person`, `household`, `person-relationship`, `group`, `office-note`, `away-date`: the members-area record types (LGC-39). All are office-admin only for now. `modules/church-audit` writes every create, change and delete to its own `churchAudit` collection (office admins read it at `/api/v1/church-audit/entries`); `lib/rules.js` holds the data rules as plain functions.
- `modules/serving-role`, `modules/roster`, `modules/away-date` (LGC-44): the servers roster. Roles (slots, weekly or monthly, and the serving group that is eligible) are records the office edits; `node app serving-role:seed` makes the starting set and an empty serving group for each. The office (the coordinator, in the POC) opens `/roster`, sees the suggested month with warnings, adjusts it, saves a draft and publishes: that sends the monthly email and gives the printable list at `/roster/<YYYY-MM>/print`. After publishing, changing a slot and pressing the swap button emails only the people that slot touches. Members mark their household's away dates at `/away` (the office can do it for any household). A published month feeds the bulletin's "Those Serving". `roster.taskConditions()` is the "next month's roster" item for the weekly tasks list, due from two weeks before the month. `node app roster:suggest --month=YYYY-MM` prints a suggestion.
- `modules/church-signin/`, `lib/signin.js`, `lib/mail.js`: sign-in by an emailed link (LGC-45). Adults who are active and have an email ask for a link at `/sign-in`; it works once and expires in 15 minutes, and asking for a new one voids the old. Minors can't sign in. A member gets an Apostrophe `guest` user, an office admin (the person's "Office admin" box) an `admin` one. Requests are rate-limited. Mail goes through one small interface with two senders: a fake one (the default) whose outbox you read at `/dev/outbox`, and Resend. A send-allowlist refuses any address not on the tester list, for both senders.
- `modules/church-directory/`, `lib/directory.js`, `lib/directory-pdf.js`, `lib/demo-data.js`: the members directory (LGC-46), signed-in people only, under `/members/`. `/members/directory` searches and browses households in two layouts, `?layout=a` (cards with family photos) and `?layout=b` (an A to Z list), and the search keeps whichever is chosen; with no option set, a church whose households have photos gets cards and one without gets the list (`defaultLayout` overrides). `/members/household/<id>` shows people, relationships and groups; a child shows name and birthday only. Members edit their own household at `/members/household/<id>/edit`, and the office edits any household and sees its change history (read from the audit trail). `/members/directory.pdf` is the printable directory: letter size, two columns, households in surname order, with hidden fields, opt-outs, visitors, the inactive and children's contacts left out. Whether adults' birthdays print is a church decision, kept as `directory.adultBirthdaysInPdf` in the site config (on for La Grange until Gary decides). Forms post plain, with a session token in place of Apostrophe's CSRF header. `CHURCH_SEED_DEMO=1` fills an empty database with made-up households on start, `CHURCH_SEED_DEMO=reset` first deletes every church record (only ever for demo and test databases), and `node app church-directory:seed-demo [--reset]` does the same by hand.
- `modules/church-demo/`, `lib/demo-seed/`: the full demo (LGC-40) and "Reset demo". `CHURCH_DEMO_MODE=1 node app church-demo:seed` fills an empty database with 45 households and about 145 people (made-up names, every address `@example.com`; the seed refuses anything else), serving and fellowship groups, three months of past rosters plus this month's, two regular services with a year of one-offs behind and two months ahead (one Wednesday cancelled, one moved), and four weeks of the tasks list with items done and carried over. The same content every run (seeded generator, fixed ids); dates move with the day it runs. The office's "Reset demo" link (in the demo banner, office admins only) opens `/demo`: it needs the page's token and the word RESET typed, then removes every church record, event and task and seeds again. It keeps every user account, the sign-in tables, the audit trail (plus one "Demo reset" entry) and the email allowlist (which is configuration). `node app church-demo:reset --yes` does the same by hand. It does nothing unless `CHURCH_DEMO_MODE=1`, so leave that off once real members are in. It never runs on a timer, and a test checks that.
- `packages/*`: npm workspaces for the logic packages; `npm test` runs theirs too.
- Spanish (`/es`) is configured but hidden: visitors get a 404, signed-in editors can reach it. All interface text goes through `__t('church:...')`, and `test/i18n.test.js` fails on any literal text in our templates.
- The POC is noindexed everywhere (`X-Robots-Tag` and a meta tag) and every page carries a "Demo data" banner.
- In production, set `CHURCH_SESSION_SECRET`; the app refuses to start without it.
- Mail settings (environment, no secrets in the repo): `CHURCH_MAIL` (`fake`, the default, or `resend`), `CHURCH_MAIL_ALLOWLIST` (exact addresses and `@domain` entries, separated by commas or spaces; defaults to `@example.com` for the fake sender and to nothing, so everything refused, for Resend), `RESEND_API_KEY` and `CHURCH_MAIL_FROM` (Resend only). Links are built from `APOS_BASE_URL`; in production no link is sent without it. Behind a proxy, set the `trustProxy` option on `@apostrophecms/express` so the rate limit sees real client IPs.

### Events and calendar feeds (LGC-41)

Events are `@apostrophecms/event` 1.0.2, extended in `modules/@apostrophecms/event` with `improve`.

- Repeats: weekly, or monthly on the nth weekday, ending after a count, on a date, or never. Each occurrence is its own record, linked by `eventGroupId`.
- Edits to a series go through `apos.event.editSeries(req, id, 'this' | 'following', changes)`, or `POST /api/v1/@apostrophecms/event/:id/edit-series`. The admin has no prompt for it yet.
- Open-ended series are kept filled 12 months ahead by a nightly task: `node app.js @apostrophecms/event:top-up`. Run it from cron or a systemd timer. It is safe to run twice.
- Feeds: `/calendar/public.ics` (public events) and `/calendar/member/<token>.ics` (a private link per member, made, replaced and turned off at `/calendar/subscribe`).
- Every event page has an "Add to Google Calendar" link.

### Month calendar (LGC-42)

- `/calendar?month=YYYY-MM` shows one month, with Previous and Next links and a jump-to-month form (month and year, works without JavaScript; it sends `m` and `y` and is redirected to the `month=` address). A missing or bad `month` means the current month in America/Chicago, never an error. Years 1000 to 9998 are accepted.
- One page, two renderings: a day-by-day list for phones and a real `<table>` for desktop; CSS (`.cal-list`, `.cal-grid` in `modules/theme`) shows one and hides the other with `display: none`.
- Visibility is decided in the query (`church-calendar` `monthEvents`): anonymous visitors get public events, a signed-in member also gets members-only ones. Cancelled events stay, struck through and labelled "Cancelled"; members-only ones are labelled "Members". Pages for a signed-in member are `private, no-store`, and every response says `Vary: Cookie`: **any cache added later must vary on signed-in state, or members-only titles leak.**
- A multi-day event shows on every day it touches. Open-ended series are only kept filled 12 months ahead (the nightly top-up task), so months further out show only one-off events; that is expected.
- The month grid and the month picker rules are in `@church-system/calendar-logic` (`src/month.js`), tested to 100% coverage.
