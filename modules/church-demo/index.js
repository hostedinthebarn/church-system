// "Reset demo" (LGC-40): the office puts the demo data back to the seed. Only
// on demand: a button with an "are you sure" step, or `node app
// church-demo:reset --yes`. Nothing in this module runs on a timer, and it
// must never get one (Gary: "never on a schedule").
//
// It does nothing unless demo mode is on (CHURCH_DEMO_MODE=1, or the
// `enabled` option), so it can't be pointed at real data later: when real
// members arrive, leave the setting off.
//
// Screens (office admins only; anyone else gets 404, signed in or not):
//   GET  /demo         what a reset does, and the form
//   POST /demo/reset   needs the page's token and the word RESET typed
const crypto = require('node:crypto');
const { resetDemo } = require('../../lib/demo-seed/reset.js');
const demo = require('../../lib/demo-data.js');

const CONFIRM_WORD = 'RESET';

module.exports = {
  options: {
    alias: 'churchDemo',
    // null: follow CHURCH_DEMO_MODE. Tests set true or false.
    enabled: null,
    // The form is plain HTML, so it carries its own token (see checkToken).
    csrfExceptions: [ '/demo/reset' ]
  },
  methods(self) {
    return {
      enabled() {
        return self.options.enabled == null
          ? process.env.CHURCH_DEMO_MODE === '1'
          : Boolean(self.options.enabled);
      },
      token(req) {
        if (!req.session.churchDemoCsrf) {
          req.session.churchDemoCsrf = crypto.randomBytes(24).toString('base64url');
        }
        return req.session.churchDemoCsrf;
      },
      checkToken(req) {
        const sent = Buffer.from(String((req.body && req.body.token) || ''));
        const have = Buffer.from(String((req.session && req.session.churchDemoCsrf) || ''));
        return have.length > 0 && sent.length === have.length && crypto.timingSafeEqual(sent, have);
      },
      isOffice(req) {
        return self.apos.permission.isAdmin(req);
      },
      // The reset itself. Throws unless demo mode is on and the caller is an
      // office admin (or the command line, which passes no req).
      async reset(req) {
        if (!self.enabled()) {
          throw self.apos.error('forbidden', 'Demo mode is off, so the demo cannot be reset.');
        }
        if (req && !self.isOffice(req)) {
          throw self.apos.error('forbidden');
        }
        return resetDemo(self.apos, { req: req || self.apos.task.getReq() });
      },
      async respond(req, data, status = 200) {
        req.res.set('Cache-Control', 'no-store');
        req.res.status(status);
        return self.sendPage(req, 'demo', {
          ...data,
          enabled: self.enabled(),
          token: self.token(req),
          word: CONFIRM_WORD
        });
      }
    };
  },
  helpers(self) {
    return {
      // For the banner: show the Reset link to office admins in demo mode.
      enabled() {
        return self.enabled();
      }
    };
  },
  routes(self) {
    const office = fn => async (req, res) => {
      if (!self.isOffice(req)) {
        return res.status(req.user ? 403 : 404).send('Not found');
      }
      try {
        return await fn(req, res);
      } catch (error) {
        self.apos.util.error(error);
        return res.status(500).send('Something went wrong.');
      }
    };
    return {
      get: {
        '/demo': office((req) => self.respond(req, { result: null }))
      },
      post: {
        '/demo/reset': office(async (req) => {
          if (!self.checkToken(req)) {
            return self.respond(req, { error: 'token' }, 400);
          }
          if (!self.enabled()) {
            return self.respond(req, { error: 'off' }, 403);
          }
          if (String((req.body && req.body.confirm) || '').trim() !== CONFIRM_WORD) {
            return self.respond(req, { error: 'confirm' }, 400);
          }
          const result = await self.reset(req);
          return self.respond(req, { result });
        })
      }
    };
  },
  tasks(self) {
    return {
      seed: {
        usage: 'Fill an empty database with the full demo (about 45 households and 150 people, groups, rosters, a year of events and the weekly tasks). Does nothing if there are households already.\n\nCHURCH_DEMO_MODE=1 node app church-demo:seed',
        async task() {
          if (!self.enabled()) {
            throw new Error('Demo mode is off. Set CHURCH_DEMO_MODE=1 to seed the demo.');
          }
          const result = await self.apos.churchAudit.withoutAudit(() => demo.seed(self.apos, { full: true }));
          // eslint-disable-next-line no-console
          console.log(result.seeded
            ? `Seeded ${result.households} households and ${result.people} people.`
            : 'The database already has households; nothing seeded. Use church-demo:reset --yes to start over.');
        }
      },
      reset: {
        usage: 'Put the demo back to the seed. Keeps user accounts and the audit trail; removes every church record, event and task, then seeds again. Never run it on real data.\n\nCHURCH_DEMO_MODE=1 node app church-demo:reset --yes',
        async task(argv) {
          if (!argv.yes) {
            throw new Error('This replaces all the demo data. Add --yes to go ahead.');
          }
          const result = await self.reset(null);
          // eslint-disable-next-line no-console
          console.log(`Reset: ${result.households} households and ${result.people} people.`);
        }
      }
    };
  }
};
