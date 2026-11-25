// Passwordless sign-in for members and the office (LGC-45). The logic lives in
// lib/signin.js and the mail interface in lib/mail.js; this module is the
// Apostrophe side: the pages, a MongoDB store for the links, the person
// lookup, and the session. A signed-in person gets an Apostrophe user of
// their own (role guest, or admin for office admins), made on first sign-in.
//
// The email carries a link and a 6-digit code (LGC-94, the Hosted in the Barn
// standard: ADR-0002). The link only opens a page, which signs in by itself
// with a POST as it loads (a button is the fallback without JavaScript), so a
// mail scanner that fetches the link doesn't spend it. The code is typed into
// the tab that asked, for when the link opens in another browser or device.
const crypto = require('node:crypto');
const { mailerFromEnv } = require('../../lib/mail.js');
const {
  createSignin, canSignIn, roleFor
} = require('../../lib/signin.js');
const rules = require('../../lib/rules.js');

const FORM_PATH = '/sign-in';
const VERIFY_PATH = '/sign-in/verify';
const CODE_PATH = '/sign-in/code';
const OUTBOX_PATH = '/dev/outbox';

module.exports = {
  options: {
    alias: 'churchSignin',
    // Set in tests; otherwise the mail interface is built from the environment.
    mail: null,
    // Plain HTML forms can't send Apostrophe's CSRF header. The request form
    // sends no secret, the verify form carries the single-use token and the
    // code form the single-use code.
    csrfExceptions: [ FORM_PATH, VERIFY_PATH, CODE_PATH ],
    limits: {}
  },
  init(self) {
    self.tokens = self.apos.db.collection('churchSigninTokens');
    self.attempts = self.apos.db.collection('churchSigninAttempts');
    self.mailer = self.options.mail || mailerFromEnv();
    self.signin = createSignin({
      store: self.mongoStore(),
      mailer: self.mailer,
      // The main email or one of the person's other sign-in addresses.
      findPerson: email => self.apos.doc.db.findOne({
        type: 'person',
        archived: { $ne: true },
        $or: [
          { email },
          { signinEmails: email }
        ]
      }),
      buildMessage: ({
        url, code, minutes, locale
      }) => self.buildMessage({
        url,
        code,
        minutes,
        locale
      }),
      log: (level, name, data) => {
        if (level === 'error') {
          self.logError(name, data);
        } else {
          self.logWarn(name, data);
        }
      },
      options: self.options.limits
    });
  },
  handlers(self) {
    return {
      'apostrophe:modulesRegistered': {
        async createIndexes() {
          // Used and expired links are tidied away a day after they expire.
          await self.tokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
          await self.tokens.createIndex({ hash: 1 }, { unique: true });
          await self.tokens.createIndex({
            email: 1,
            usedAt: 1
          });
          await self.attempts.createIndex({ at: 1 }, { expireAfterSeconds: 86400 });
          await self.attempts.createIndex({
            kind: 1,
            key: 1,
            at: -1
          });
        }
      }
    };
  },
  routes(self) {
    return {
      get: {
        [FORM_PATH]: async (req, res) => {
          if (req.user) {
            return res.redirect('/');
          }
          return self.page(req, 'signIn', { state: 'form' });
        },
        [VERIFY_PATH]: async (req, res) => {
          const token = typeof req.query.token === 'string' ? req.query.token : '';
          return self.page(req, 'confirm', { token });
        },
        [OUTBOX_PATH]: async (req, res) => {
          if (!self.outboxVisibleTo(req)) {
            return res.status(404).send('Not found');
          }
          return self.page(req, 'outbox', {
            messages: self.mailer.sender.outbox().reverse().map(message => ({
              ...message,
              link: (/https?:\/\/\S+/.exec(message.text) || [])[0] || null
            })),
            allowlist: self.mailer.allowlist
          });
        }
      },
      post: {
        [FORM_PATH]: async (req, res) => {
          const email = typeof req.body.email === 'string' ? req.body.email : '';
          const result = await self.signin.requestLink({
            email,
            ip: req.ip,
            verifyUrl: self.absoluteUrl(req, VERIFY_PATH),
            locale: req.locale
          });
          if (result.status === 'limited') {
            return self.page(req, 'signIn', { state: 'limited' }, 429);
          }
          if (result.status === 'invalid') {
            return self.page(req, 'signIn', { state: 'invalid' }, 400);
          }
          // The same answer whether or not the address is on file; the code
          // form only works for a sign-in that was really sent.
          return self.page(req, 'signIn', {
            state: 'sent',
            email: result.status === 'sent' ? email.trim() : ''
          });
        },
        [CODE_PATH]: async (req, res) => {
          const email = typeof req.body.email === 'string' ? req.body.email : '';
          const code = typeof req.body.code === 'string' ? req.body.code : '';
          const result = await self.signin.redeemCode({
            email,
            code,
            ip: req.ip
          });
          const person = result.ok ? await self.findSignable(result.personId) : null;
          if (!person) {
            return self.page(req, 'signIn', {
              state: 'sent',
              email: email.trim(),
              codeError: result.reason === 'rate-limit' ? 'limited' : 'wrong'
            }, result.reason === 'rate-limit' ? 429 : 400);
          }
          return self.finish(req, res, person);
        },
        [VERIFY_PATH]: async (req, res) => {
          const token = typeof req.body.token === 'string' ? req.body.token : '';
          const result = await self.signin.redeem({
            token,
            ip: req.ip
          });
          const person = result.ok ? await self.findSignable(result.personId) : null;
          if (!person) {
            return self.page(req, 'badLink', {}, result.reason === 'rate-limit' ? 429 : 400);
          }
          return self.finish(req, res, person);
        }
      }
    };
  },
  methods(self) {
    return {
      // The person behind a redeemed link or code, checked again: they may
      // have changed (left, become inactive) since it was sent.
      async findSignable(personId) {
        const person = await self.apos.doc.db.findOne({
          type: 'person',
          _id: personId,
          archived: { $ne: true }
        });
        return person && canSignIn(person, rules.todayIso()) ? person : null;
      },
      async finish(req, res, person) {
        const user = await self.userFor(person);
        await self.apos.login.passportLogin(req, user);
        return res.redirect('/');
      },
      async page(req, template, data, status = 200) {
        req.res.set('Cache-Control', 'no-store');
        req.res.status(status);
        return self.sendPage(req, template, data);
      },
      // Links must point at our own address. A Host header the caller chose is
      // only trusted outside production, for local work.
      absoluteUrl(req, path) {
        if (self.apos.baseUrl) {
          return new URL(path, self.apos.baseUrl).toString();
        }
        if (process.env.NODE_ENV === 'production') {
          return null;
        }
        return `${req.protocol}://${req.get('host')}${path}`;
      },
      outboxVisibleTo(req) {
        if (self.mailer.sender.name !== 'fake') {
          return false;
        }
        return process.env.NODE_ENV !== 'production' ||
          Boolean(req.user && req.user.role === 'admin');
      },
      buildMessage({
        url, code, minutes, locale
      }) {
        const siteModule = self.apos.modules['church-site'];
        const site = self.options.siteName || (siteModule && siteModule.options.site.name) || '';
        const t = key => self.apos.i18n.i18next.t(key, {
          lng: locale,
          url,
          code,
          minutes,
          site,
          interpolation: { escapeValue: false }
        });
        return {
          subject: t('church:signinEmailSubject'),
          text: t('church:signinEmailBody')
        };
      },
      // The Apostrophe user for a person: made on first sign-in, and kept in
      // step with the person's email and office-admin flag every time.
      async userFor(person) {
        const username = `person-${person.aposDocId || person._id}`;
        const role = roleFor(person);
        const req = self.apos.task.getReq();
        const existing = await self.apos.doc.db.findOne({
          type: '@apostrophecms/user',
          username
        });
        if (!existing) {
          return self.apos.user.insert(req, {
            ...self.apos.user.newInstance(),
            title: person.title,
            username,
            email: person.email,
            role,
            personId: person._id,
            // Never used: sign-in is by emailed link only.
            password: crypto.randomBytes(48).toString('base64url')
          });
        }
        const current = [ existing.role, existing.email, existing.title ];
        if (current.join('\n') !== [ role, person.email, person.title ].join('\n')) {
          existing.role = role;
          existing.email = person.email;
          existing.title = person.title;
          return self.apos.user.update(req, existing);
        }
        return existing;
      },
      mongoStore() {
        return {
          addAttempt: (kind, key, at) => self.attempts.insertOne({
            kind,
            key,
            at
          }),
          countAttempts: (kind, key, since) => self.attempts.countDocuments({
            kind,
            key,
            at: { $gte: since }
          }),
          revokeTokens: personId => self.tokens.updateMany(
            {
              personId,
              usedAt: null
            },
            { $set: { usedAt: new Date() } }
          ),
          createToken: record => self.tokens.insertOne({
            ...record,
            usedAt: null
          }),
          // The code: one atomic step on the address's live sign-in.
          consumeCode: async (email, codeHash, now) => {
            const found = await self.tokens.findOneAndUpdate(
              {
                email,
                codeHash,
                usedAt: null,
                expiresAt: { $gt: now }
              },
              { $set: { usedAt: now } }
            );
            return found && found.value !== undefined ? found.value : found;
          },
          // A wrong code: count it, and end the sign-in at maxTries.
          missCode: async (email, now, maxTries) => {
            const live = {
              email,
              usedAt: null,
              expiresAt: { $gt: now }
            };
            await self.tokens.updateMany(live, { $inc: { codeMisses: 1 } });
            await self.tokens.updateMany({
              ...live,
              codeMisses: { $gte: maxTries }
            }, { $set: { usedAt: now } });
          },
          // One atomic step, so a link can't be spent twice.
          consumeToken: async (hash, now) => {
            const found = await self.tokens.findOneAndUpdate(
              {
                hash,
                usedAt: null,
                expiresAt: { $gt: now }
              },
              { $set: { usedAt: now } }
            );
            // The driver returns the document itself (v6+) or { value }.
            return found && found.value !== undefined ? found.value : found;
          }
        };
      }
    };
  }
};
