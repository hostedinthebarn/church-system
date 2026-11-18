// The church's additions to @apostrophecms/event (LGC-41, events-poc.md).
// `improve` changes the module in place, so the admin, the event pages and
// every query keep working on the one "event" type.
//
// What the stock module does and we replace:
// - Repeats. The stock module copies an event a fixed number of times, weekly
//   or on the same date each month. Ours expands a rule with
//   @church-system/calendar-logic: weekly, or monthly on the nth weekday,
//   ending after a count, on a date, or never (the nightly top-up keeps an
//   open series filled 12 months ahead).
// - Times. The stock module builds start and end in the server's time zone.
//   Ours are America/Chicago wall-clock times turned into UTC instants.
// - The series link. `eventGroupId` and `isClone` weren't schema fields, so
//   publishing lost them (SW-127). They are now, hidden and read-only.
//
// Each occurrence is its own record, grouped by eventGroupId. `ruleDate` is the
// date the repeat rule gave an occurrence, kept when one is moved so the
// top-up doesn't create it again.
const {
  firstOccurrences, ruleFor, instants, clock
} = require('../../../lib/event-series.js');
const { googleCalendarUrl } = require('../../../lib/ical.js');
const {
  occurrencesToChange, topUp
} = require('@church-system/calendar-logic');
const { instantToLocal } = require('@church-system/calendar-logic');
const rules = require('../../../lib/rules.js');

// What an editor may change on one or many occurrences. The date is only for
// "this one only": moving every later occurrence is a different rule.
const SERIES_FIELDS = [
  'title', 'description', 'place', 'startTime', 'endTime', 'status',
  'publicEvent', 'regularService', 'notifyFacebook', 'announceFrom'
];
const ONE_ONLY_FIELDS = [ 'startDate', 'endDate', 'allDay' ];
const RELATIONSHIPS = [ '_image', '_contact' ];
// Edits that make an occurrence "changed" when the office didn't say so.
const MOVING_FIELDS = [ 'startDate', 'startTime', 'endTime', 'place', 'allDay' ];

module.exports = {
  improve: '@apostrophecms/event',
  options: {
    alias: 'event'
  },
  fields(self) {
    return {
      add: {
        place: {
          type: 'string',
          label: 'church:eventPlace'
        },
        regularService: {
          type: 'boolean',
          label: 'church:eventRegularService',
          help: 'church:eventRegularServiceHelp',
          def: false
        },
        publicEvent: {
          type: 'boolean',
          label: 'church:eventPublic',
          help: 'church:eventPublicHelp',
          def: true
        },
        status: {
          type: 'select',
          label: 'church:eventStatus',
          def: 'scheduled',
          choices: [
            {
              label: 'church:eventStatusScheduled',
              value: 'scheduled'
            },
            {
              label: 'church:eventStatusChanged',
              value: 'changed'
            },
            {
              label: 'church:eventStatusCancelled',
              value: 'cancelled'
            }
          ]
        },
        announceFrom: {
          type: 'date',
          label: 'church:eventAnnounceFrom',
          help: 'church:eventAnnounceFromHelp'
        },
        notifyFacebook: {
          type: 'boolean',
          label: 'church:eventNotifyFacebook',
          help: 'church:eventNotifyFacebookHelp',
          def: true
        },
        _image: {
          type: 'relationship',
          label: 'church:eventImage',
          withType: '@apostrophecms/image',
          max: 1
        },
        _contact: {
          type: 'relationship',
          label: 'church:eventContact',
          withType: 'person',
          max: 1
        },
        // Set from the contact on every save: people are office-only records,
        // and the event page shows members only the name.
        contactName: {
          type: 'string',
          label: 'church:eventContact',
          readOnly: true,
          hidden: true
        },
        repeatPattern: {
          type: 'select',
          label: 'church:eventRepeatPattern',
          choices: [
            {
              label: 'church:eventRepeatWeekly',
              value: 'weekly'
            },
            {
              label: 'church:eventRepeatNthWeekday',
              value: 'nth-weekday'
            }
          ],
          def: 'weekly',
          if: { dateType: 'repeat' }
        },
        repeatEnds: {
          type: 'select',
          label: 'church:eventRepeatEnds',
          choices: [
            {
              label: 'church:eventRepeatEndsCount',
              value: 'count'
            },
            {
              label: 'church:eventRepeatEndsUntil',
              value: 'until'
            },
            {
              label: 'church:eventRepeatEndsNever',
              value: 'never'
            }
          ],
          def: 'count',
          if: { dateType: 'repeat' }
        },
        repeatUntil: {
          type: 'date',
          label: 'church:eventRepeatUntil',
          if: {
            dateType: 'repeat',
            repeatEnds: 'until'
          }
        },
        // The series link, and the rule, as stored fields so they survive
        // publishing (Apostrophe copies only schema fields). Only this module
        // sets them: readOnly keeps a save from clearing or changing them.
        eventGroupId: {
          type: 'string',
          label: 'Series',
          hidden: true,
          readOnly: true
        },
        isClone: {
          type: 'boolean',
          label: 'Repeat copy',
          hidden: true,
          readOnly: true
        },
        // Set by a "this one only" edit. The nightly top-up never copies an
        // exception, so a one-off change (a guest speaker, a cancellation)
        // can't spread to the dates it creates.
        seriesException: {
          type: 'boolean',
          label: 'Edited on its own',
          hidden: true,
          readOnly: true
        },
        ruleDate: {
          type: 'string',
          label: 'Rule date',
          hidden: true,
          readOnly: true
        },
        seriesRule: {
          type: 'string',
          label: 'Series rule',
          hidden: true,
          readOnly: true
        }
      },
      remove: [ 'repeatInterval' ],
      group: {
        basics: {
          fields: [
            'description', 'startDate', 'allDay', 'startTime', 'endTime', 'place',
            'status', 'publicEvent', 'regularService'
          ]
        },
        announce: {
          label: 'church:eventGroupAnnounce',
          fields: [ 'announceFrom', 'notifyFacebook', '_image', '_contact' ]
        },
        advanced: {
          label: 'aposEvent:advanced',
          fields: [
            'dateType', 'endDate', 'repeatPattern', 'repeatEnds', 'repeatCount', 'repeatUntil'
          ]
        }
      }
    };
  },
  handlers(self) {
    return {
      beforeSave: {
        syncVisibility(req, piece) {
          // The public flag is the one switch: a members-only event is
          // login-required, so anonymous visitors get a 404 for its page.
          piece.visibility = piece.publicEvent === false ? 'loginRequired' : 'public';
          if (!piece.ruleDate) {
            piece.ruleDate = piece.startDate;
          }
        },
        async setContactName(req, piece) {
          const id = (piece._contact && piece._contact[0] && piece._contact[0].aposDocId) ||
            (piece.contactIds && piece.contactIds[0]);
          if (!id) {
            piece.contactName = '';
            return;
          }
          const person = await self.apos.doc.db.findOne({
            type: 'person',
            aposDocId: String(id).split(':')[0]
          });
          piece.contactName = person
            ? `${person.preferredName || person.firstName} ${person.lastName}`
            : '';
        }
      },
      beforeInsert: {
        // Replaces the stock handler: also records the rule on the parent.
        setGroupId(req, piece) {
          if (piece.dateType === 'repeat' && !piece.eventGroupId && piece.aposMode === 'draft') {
            piece.eventGroupId = self.apos.util.generateId();
            piece.seriesRule = JSON.stringify(ruleFor(piece));
            piece.ruleDate = piece.startDate;
          }
        }
      },
      afterInsert: {
        // Replaces the stock handler; calls our repeatEvent.
        async createRepeatItems(req, piece) {
          if (piece.isClone) {
            return;
          }
          if (piece.dateType === 'repeat' && piece.aposMode === 'draft') {
            await self.repeatEvent(req, piece);
          }
        }
      },
      afterPublish: {
        // Replaces the stock handler, which looked children up through a query
        // that couldn't see the group id after publishing.
        async publishChildren(req, data) {
          if (data.published.dateType !== 'repeat' || !data.firstTime) {
            return;
          }
          const children = await self.apos.doc.db.find({
            type: self.name,
            aposMode: 'draft',
            aposLocale: data.draft.aposLocale,
            eventGroupId: data.draft.eventGroupId,
            isClone: true
          }).toArray();
          for (const child of children) {
            await self.publish(req, await self.findOneForEditing(req.clone({ mode: 'draft' }), { _id: child._id }));
          }
        }
      }
    };
  },
  methods(self) {
    return {
      // Chicago wall-clock to UTC instants (replaces the stock method).
      denormalizeDatesAndTimes(piece) {
        if (piece.dateType !== 'consecutive') {
          piece.endDate = piece.startDate;
        }
        if (piece.dateType === 'repeat') {
          piece.hasClones = true;
        }
        const { start, end } = instants({
          startDate: piece.startDate,
          endDate: piece.endDate,
          allDay: piece.allDay,
          startTime: piece.startTime,
          endTime: piece.endTime
        });
        piece.start = start;
        piece.end = end;
      },
      // Creates the other occurrences of a new series (replaces the stock
      // method). The first one is the piece itself.
      async repeatEvent(req, piece) {
        const dates = firstOccurrences(piece, rules.todayIso()).slice(1);
        for (const occurrence of dates) {
          await self.insert(req, self.occurrenceFrom(piece, occurrence.date));
        }
      },
      // A new, scheduled occurrence copied from `template` on `date`.
      occurrenceFrom(template, date, overrides = {}) {
        const copy = { ...template };
        for (const key of [
          '_id', 'aposDocId', 'aposLocale', 'createdAt', 'updatedAt', 'updatedBy', 'createdBy', 'lastPublishedAt', 'modified'
        ]) {
          delete copy[key];
        }
        Object.assign(copy, {
          isClone: true,
          hasClones: false,
          dateType: 'single',
          startDate: date,
          endDate: date,
          ruleDate: date,
          status: 'scheduled',
          seriesException: false,
          announceFrom: null,
          slug: `${String(template.slug).replace(/-\d{4}-\d{2}-\d{2}$/, '')}-${date}`
        }, overrides);
        self.denormalizeDatesAndTimes(copy);
        return copy;
      },
      // One series' draft occurrences, earliest first.
      async seriesOf(req, eventGroupId) {
        const found = await self.apos.doc.db.find({
          type: self.name,
          aposMode: 'draft',
          aposLocale: `${req.locale || 'en'}:draft`,
          eventGroupId,
          archived: { $ne: true }
        }).toArray();
        return found.sort((a, b) => a.start - b.start);
      },
      // "This one only" / "this and all after" (events-poc.md, Repeats).
      // `at` is the _id of the occurrence the editor opened, `scope` is 'this'
      // or 'following', `changes` the fields to set. Returns the changed
      // records. Works on drafts; with { publish: true } it publishes each
      // changed occurrence that has been published before.
      async editSeries(req, at, scope, changes, { publish = false } = {}) {
        const draftReq = req.clone({ mode: 'draft' });
        const opened = await self.findOneForEditing(draftReq, { _id: at });
        if (!opened) {
          throw self.apos.error('notfound');
        }
        if (!opened.eventGroupId) {
          return [ await self.updateOccurrence(draftReq, opened, changes, scope, publish) ];
        }
        const all = await self.seriesOf(draftReq, opened.eventGroupId);
        const picked = occurrencesToChange(
          all.map(o => ({
            id: o._id,
            startsAt: o.start.toISOString()
          })),
          opened._id,
          scope
        );
        const changed = [];
        for (const { id } of picked) {
          const piece = all.find(o => o._id === id);
          changed.push(await self.updateOccurrence(draftReq, piece, changes, scope, publish));
        }
        return changed;
      },
      async updateOccurrence(req, piece, changes, scope, publish) {
        const allowed = scope === 'this' ? [ ...SERIES_FIELDS, ...ONE_ONLY_FIELDS, ...RELATIONSHIPS ] : SERIES_FIELDS;
        const set = {};
        for (const key of allowed) {
          if (key in changes) {
            set[key] = changes[key];
          }
        }
        // A one-day event moved to another date moves its end date with it.
        if ('startDate' in set && !('endDate' in set)) {
          set.endDate = set.startDate;
        }
        if (!('status' in set) && piece.status === 'scheduled' &&
          MOVING_FIELDS.some(key => key in set && set[key] !== piece[key])) {
          set.status = 'changed';
        }
        Object.assign(piece, set);
        if (scope === 'this' && piece.eventGroupId) {
          piece.seriesException = true;
        }
        // A time change for this and all after is the series' new time.
        if (scope === 'following' && piece.seriesRule && ('startTime' in set || 'endTime' in set)) {
          const rule = JSON.parse(piece.seriesRule);
          rule.time = clock(piece.startTime);
          rule.durationMinutes = instants({
            ...piece,
            endDate: piece.startDate
          }).durationMinutes;
          piece.seriesRule = JSON.stringify(rule);
        }
        const saved = await self.update(req, piece);
        if (publish && await self.hasPublished(saved)) {
          await self.publish(req, saved);
        }
        return saved;
      },
      async hasPublished(draft) {
        return Boolean(await self.apos.doc.db.findOne({
          aposDocId: draft.aposDocId,
          aposLocale: draft.aposLocale.replace(':draft', ':published')
        }, { projection: { _id: 1 } }));
      },
      // The nightly job: fill every open-ended series 12 months ahead. Safe to
      // run twice; it only creates dates the series doesn't have yet (moved
      // and cancelled occurrences count as having theirs). A new occurrence is
      // published when its series already is, so the public site and the feeds
      // see it. Returns how many were created.
      async topUpSeries(req, { today = rules.todayIso(), months = 12 } = {}) {
        const draftReq = req.clone({ mode: 'draft' });
        const groups = await self.apos.doc.db.distinct('eventGroupId', {
          type: self.name,
          aposMode: 'draft',
          repeatEnds: 'never',
          eventGroupId: { $nin: [ null, '' ] },
          archived: { $ne: true }
        });
        let created = 0;
        for (const group of groups) {
          // Per locale: events are localized, so each locale has its own series.
          const locales = await self.apos.doc.db.distinct('aposLocale', {
            type: self.name,
            aposMode: 'draft',
            eventGroupId: group
          });
          for (const aposLocale of locales) {
            created += await self.topUpOne(draftReq.clone({ locale: aposLocale.split(':')[0] }), group, today, months);
          }
        }
        return created;
      },
      async topUpOne(req, group, today, months) {
        const all = await self.apos.doc.db.find({
          type: self.name,
          aposMode: 'draft',
          aposLocale: `${req.locale}:draft`,
          eventGroupId: group
        }).toArray();
        // Archived occurrences still count as existing: the top-up must not
        // bring back one the office removed.
        // The template is the newest occurrence that still follows the series:
        // not archived, not edited on its own. "This and all after" edits reach
        // it, so it carries the series' current details.
        const template = all
          .filter(o => !o.archived && !o.seriesException)
          .sort((a, b) => (a.ruleDate < b.ruleDate ? 1 : -1))[0];
        if (!template || !template.seriesRule) {
          return 0;
        }
        const rule = JSON.parse(template.seriesRule);
        const wanted = topUp(rule, all.map(o => o.ruleDate), today, months);
        const published = await self.hasPublished(template);
        for (const occurrence of wanted) {
          const startTime = clock(rule.time);
          const [ h, m ] = startTime.split(':').map(Number);
          const endMinutes = h * 60 + m + (rule.durationMinutes || 0);
          const endTime = `${String(Math.floor(endMinutes / 60) % 24).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
          const created = await self.insert(req, self.occurrenceFrom(template, occurrence.date, {
            startTime,
            endTime,
            seriesRule: template.seriesRule
          }));
          if (published) {
            await self.publish(req, created);
          }
        }
        return wanted.length;
      },
      // "Sunday, December 6, 2026, 10:00 AM to 11:00 AM", in Chicago time.
      whenText(piece, locale = 'en') {
        const zone = { timeZone: 'America/Chicago' };
        const day = new Intl.DateTimeFormat(locale, {
          ...zone,
          dateStyle: 'full'
        });
        const time = new Intl.DateTimeFormat(locale, {
          ...zone,
          timeStyle: 'short'
        });
        if (piece.allDay) {
          return day.format(piece.start);
        }
        return `${day.format(piece.start)}, ${time.format(piece.start)} – ${time.format(piece.end)}`;
      },
      // The plain shape the feeds and the Google Calendar link take.
      feedShape(piece, absoluteUrl) {
        const local = instantToLocal(piece.start);
        return {
          id: piece.aposDocId,
          title: piece.title,
          description: piece.description,
          place: piece.place,
          startsAt: piece.start.toISOString(),
          endsAt: piece.end.toISOString(),
          allDay: Boolean(piece.allDay),
          startDate: piece.startDate || local.date,
          endDate: piece.endDate || piece.startDate || local.date,
          status: piece.status || 'scheduled',
          url: piece._url ? absoluteUrl(piece._url) : null,
          updatedAt: piece.updatedAt || null
        };
      }
    };
  },
  apiRoutes(self) {
    return {
      post: {
        ':_id/edit-series': async (req) => {
          const body = req.body || {};
          if (!self.apos.permission.can(req, 'edit', self.name)) {
            throw self.apos.error('forbidden');
          }
          const scope = self.apos.launder.select(body.scope, [ 'this', 'following' ], 'this');
          const changes = body.changes && typeof body.changes === 'object' ? body.changes : {};
          const changed = await self.editSeries(req, self.inferIdLocaleAndMode(req, req.params._id), scope, changes, {
            publish: self.apos.launder.boolean(body.publish)
          });
          return { changed: changed.map(o => o._id) };
        }
      }
    };
  },
  tasks(self) {
    return {
      'top-up': {
        usage: 'Fills every open-ended event series 12 months ahead. Run nightly; safe to run twice.',
        async task() {
          const created = await self.topUpSeries(self.apos.task.getReq());
          // eslint-disable-next-line no-console
          console.log(`Created ${created} event occurrence${created === 1 ? '' : 's'}.`);
        }
      }
    };
  },
  helpers(self) {
    return {
      googleCalendarUrl(piece) {
        const base = self.apos.baseUrl;
        return googleCalendarUrl(self.feedShape(piece, url => (base ? new URL(url, base).toString() : null)));
      },
      whenText(piece, locale) {
        return self.whenText(piece, locale);
      }
    };
  }
};
