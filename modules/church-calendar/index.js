// The two calendar feeds (LGC-41, events-poc.md "Where an event goes"):
// - the public feed, public events only, at /calendar/public.ics;
// - a private feed per member, at /calendar/member/<token>.ics, which also
//   carries members-only events. The member makes, replaces or turns off the
//   link on /calendar/subscribe. Only a hash of the token is stored, and the
//   link is shown once, when it is made.
//
// Both feeds include regular services and cancelled events (marked cancelled).
// Neither ever shows who created an event or a contact's details.
const crypto = require('node:crypto');
const { buildFeed } = require('../../lib/ical.js');
const { canSignIn } = require('../../lib/signin.js');
const rules = require('../../lib/rules.js');
const { addDays } = require('@church-system/calendar-logic/src/dates.js');
const {
  buildMonth, monthBounds, monthFromQuery, monthKey, shiftMonth
} = require('@church-system/calendar-logic/src/month.js');

const PUBLIC_PATH = '/calendar/public.ics';
const MEMBER_PREFIX = '/calendar/member/';
const SUBSCRIBE_PATH = '/calendar/subscribe';
const MONTH_PATH = '/calendar';
// More than any church puts on one month's calendar.
const MONTH_LIMIT = 1000;
// A subscriber's calendar keeps what happened in the last 60 days.
const LOOK_BACK_DAYS = 60;
const FEED_LIMIT = 5000;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = {
  options: {
    alias: 'churchCalendar',
    calendarName: 'Church events'
  },
  init(self) {
    self.feeds = self.apos.db.collection('churchCalendarFeeds');
  },
  handlers(self) {
    return {
      'apostrophe:modulesRegistered': {
        async createIndexes() {
          await self.feeds.createIndex({ hash: 1 }, { unique: true });
          await self.feeds.createIndex({ personId: 1 });
        }
      }
    };
  },
  routes(self) {
    return {
      get: {
        [MONTH_PATH]: async (req, res) => {
          const month = monthFromQuery(req.query, rules.todayIso());
          // The picker sends y and m; show the one address for a month.
          if (req.query && (req.query.y !== undefined || req.query.m !== undefined)) {
            return res.redirect(`${MONTH_PATH}?month=${monthKey(month)}`);
          }
          return self.monthPage(req, month);
        },
        [PUBLIC_PATH]: async (req, res) => {
          const events = await self.eventsFor(req, self.apos.task.getReq({
            role: 'anon',
            mode: 'published',
            locale: 'en'
          }), { publicOnly: true });
          res.set('Cache-Control', 'public, max-age=900');
          return self.sendFeed(req, res, events, self.options.calendarName);
        },
        [`${MEMBER_PREFIX}:token.ics`]: async (req, res) => {
          const person = await self.personForToken(req.params.token);
          if (!person) {
            return res.status(404).send('Not found');
          }
          const events = await self.eventsFor(req, self.apos.task.getReq({
            role: 'guest',
            mode: 'published',
            locale: 'en'
          }), { publicOnly: false });
          // The link is a secret: never cached, never passed on in a Referer.
          res.set('Cache-Control', 'private, no-store');
          res.set('Referrer-Policy', 'no-referrer');
          return self.sendFeed(req, res, events, `${self.options.calendarName} (members)`);
        },
        [SUBSCRIBE_PATH]: async (req, res) => {
          if (!req.user) {
            return res.redirect('/sign-in');
          }
          return self.subscribePage(req, {});
        }
      },
      post: {
        [`${SUBSCRIBE_PATH}/new`]: async (req, res) => {
          const personId = self.personIdOf(req);
          if (!personId) {
            return res.redirect('/sign-in');
          }
          const token = await self.makeLink(personId);
          const url = self.absoluteUrl(req, `${MEMBER_PREFIX}${token}.ics`);
          return self.subscribePage(req, { link: url });
        },
        [`${SUBSCRIBE_PATH}/off`]: async (req, res) => {
          const personId = self.personIdOf(req);
          if (!personId) {
            return res.redirect('/sign-in');
          }
          await self.revokeLinks(personId);
          return self.subscribePage(req, { turnedOff: true });
        }
      }
    };
  },
  methods(self) {
    return {
      // The events that touch a month, as the month page shows them. Who may
      // see what is decided here, in the query, not in the template: the query
      // is run as the visitor, so Apostrophe itself leaves members-only
      // (login-required) events out for anyone not signed in, and the explicit
      // condition keeps that true if the visibility field ever drifts.
      // Cancelled events are kept: the page strikes them through.
      async monthEvents(req, month) {
        const { first, last } = monthBounds(month);
        const viewer = req.clone({ mode: 'published' });
        const query = self.apos.event.find(viewer, {
          startDate: { $lte: last },
          endDate: { $gte: first }
        });
        if (!req.user) {
          query.and({ publicEvent: { $ne: false } });
        }
        const pieces = await query.sort({
          startDate: 1,
          start: 1
        }).limit(MONTH_LIMIT).toArray();
        const time = new Intl.DateTimeFormat(req.locale || 'en', {
          timeZone: 'America/Chicago',
          timeStyle: 'short'
        });
        return pieces.map(piece => ({
          id: piece.aposDocId,
          title: piece.title,
          url: piece._url || null,
          startDate: piece.startDate,
          endDate: piece.endDate || piece.startDate,
          time: piece.allDay ? '' : time.format(piece.start),
          cancelled: piece.status === 'cancelled',
          membersOnly: piece.publicEvent === false
        }));
      },
      async monthPage(req, month) {
        const locale = req.locale || 'en';
        const today = rules.todayIso();
        const events = await self.monthEvents(req, month);
        const { weeks, days } = buildMonth(month, events, today);
        const names = (options, count, at) => Array.from({ length: count }, (_, i) =>
          new Intl.DateTimeFormat(locale, {
            ...options,
            timeZone: 'UTC'
          }).format(at(i)));
        const dayLabel = new Intl.DateTimeFormat(locale, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC'
        });
        const link = shifted => (shifted ? `${MONTH_PATH}?month=${monthKey(shifted)}` : null);
        // 2026-11-01 was a Sunday: weekday names start there.
        const sunday = Date.UTC(2026, 10, 1);
        if (req.user) {
          req.res.set('Cache-Control', 'private, no-store');
        }
        req.res.set('Vary', 'Cookie');
        return self.sendPage(req, 'month', {
          title: new Intl.DateTimeFormat(locale, {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC'
          }).format(Date.UTC(month.y, month.mo - 1, 1)),
          weekdays: names({ weekday: 'long' }, 7, i => sunday + i * 86400000),
          monthNames: names({ month: 'long' }, 12, i => Date.UTC(2026, i, 1)),
          year: month.y,
          monthNumber: month.mo,
          prevUrl: link(shiftMonth(month, -1)),
          nextUrl: link(shiftMonth(month, 1)),
          todayUrl: monthKey(month) === today.slice(0, 7) ? null : MONTH_PATH,
          weeks,
          days: days.map(day => ({
            ...day,
            label: dayLabel.format(Date.parse(`${day.date}T00:00:00Z`))
          })),
          empty: days.length === 0,
          signedIn: Boolean(req.user)
        });
      },
      // Events for a feed, as the plain shape lib/ical.js takes. `req` is the
      // web request (for absolute addresses); `viewer` is the request the
      // events are read as: an anonymous visitor, or a signed-in member.
      async eventsFor(req, viewer, { publicOnly }) {
        const from = addDays(rules.todayIso(), -LOOK_BACK_DAYS);
        const query = self.apos.event.find(viewer, { endDate: { $gte: from } });
        if (publicOnly) {
          query.and({ publicEvent: { $ne: false } });
        }
        const pieces = await query.sort({ start: 1 }).limit(FEED_LIMIT).toArray();
        const absolute = url => self.absoluteUrl(req, url);
        return pieces.map(piece => self.apos.event.feedShape(piece, absolute));
      },
      sendFeed(req, res, events, name) {
        const base = self.apos.baseUrl || `${req.protocol}://${req.get('host')}`;
        res.set('Content-Type', 'text/calendar; charset=utf-8');
        return res.send(buildFeed({
          name,
          host: new URL(base).hostname,
          events
        }));
      },
      personIdOf(req) {
        return req.user && req.user.personId;
      },
      async makeLink(personId) {
        // One link per person: a new one replaces the old.
        await self.revokeLinks(personId);
        const token = crypto.randomBytes(32).toString('base64url');
        await self.feeds.insertOne({
          hash: hashToken(token),
          personId,
          createdAt: new Date(),
          revokedAt: null
        });
        return token;
      },
      async revokeLinks(personId) {
        await self.feeds.updateMany(
          {
            personId,
            revokedAt: null
          },
          { $set: { revokedAt: new Date() } }
        );
      },
      async hasLink(personId) {
        return Boolean(await self.feeds.findOne({
          personId,
          revokedAt: null
        }));
      },
      // The person a link belongs to, if the link is live and the person can
      // still sign in (a feed doesn't outlive the membership).
      async personForToken(token) {
        const feed = await self.feeds.findOne({
          hash: hashToken(token),
          revokedAt: null
        });
        if (!feed) {
          return null;
        }
        const person = await self.apos.doc.db.findOne({
          type: 'person',
          _id: feed.personId,
          archived: { $ne: true }
        });
        return person && canSignIn(person, rules.todayIso()) ? person : null;
      },
      absoluteUrl(req, path) {
        if (self.apos.baseUrl) {
          return new URL(path, self.apos.baseUrl).toString();
        }
        if (process.env.NODE_ENV === 'production') {
          return null;
        }
        return `${req.protocol}://${req.get('host')}${path}`;
      },
      async subscribePage(req, data) {
        const personId = self.personIdOf(req);
        req.res.set('Cache-Control', 'no-store');
        req.res.set('Referrer-Policy', 'no-referrer');
        return self.sendPage(req, 'subscribe', {
          ...data,
          signedInPerson: Boolean(personId),
          hasLink: personId ? await self.hasLink(personId) : false,
          publicUrl: self.absoluteUrl(req, PUBLIC_PATH),
          publicWebcal: (self.absoluteUrl(req, PUBLIC_PATH) || '').replace(/^https?:/, 'webcal:'),
          memberWebcal: (data.link || '').replace(/^https?:/, 'webcal:')
        });
      }
    };
  }
};
