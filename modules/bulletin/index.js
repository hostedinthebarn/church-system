// A week's bulletin (LGC-61): the typed boxes, the office's event ticks and
// the status draft -> signed off -> printed. Everything else is filled from
// the church's records each time it is shown (packages/bulletin-logic), so a
// printed copy is always the data as it is now, not a stored snapshot.
//
// Pages (office admin unless noted):
//   GET  /bulletin/<date>        the website version: only sections with the
//                                website switch on; public once signed off
//   GET  /bulletin/<date>/edit   the editing screen with a preview
//   GET  /bulletin/<date>/print  the two 14 x 8.5 in pages, for the browser
//   GET  /bulletin/<date>/pdf    the same as a tagged PDF
//   POST /bulletin/<date>/save   typed boxes and event ticks (back to draft)
//   POST /bulletin/<date>/status draft | signedOff | printed
const logic = require('@church-system/bulletin-logic');
const rules = require('../../lib/rules.js');
const { renderEditor } = require('./lib/editor.js');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = [ 'draft', 'signedOff', 'printed' ];

const handSchema = logic.handFields().map(field => [ field.key, field ]);

module.exports = {
  extend: '@apostrophecms/piece-type',
  options: {
    alias: 'bulletin',
    shortcut: 'G,B',
    label: 'Bulletin',
    pluralLabel: 'Bulletins',
    localized: false,
    viewRole: 'admin',
    editRole: 'admin',
    publishRole: 'admin',
    searchable: false
  },
  fields: {
    add: {
      title: {
        type: 'string',
        label: 'Title',
        readOnly: true
      },
      weekOf: {
        type: 'date',
        label: 'Sunday',
        required: true
      },
      // Moves only through the status route, which checks the panels fit.
      status: {
        type: 'select',
        label: 'Status',
        def: 'draft',
        readOnly: true,
        choices: [
          {
            label: 'Draft',
            value: 'draft'
          },
          {
            label: 'Signed off',
            value: 'signedOff'
          },
          {
            label: 'Printed',
            value: 'printed'
          }
        ]
      },
      overflowOverride: {
        type: 'boolean',
        label: 'Signed off with a full panel',
        def: false,
        readOnly: true
      },
      ...Object.fromEntries(handSchema.map(([ key, field ]) => [ key, field.type === 'date'
        ? {
          type: 'date',
          label: field.label
        }
        : {
          type: 'string',
          label: field.label,
          textarea: true
        } ])),
      // The office's ticks. A public event not listed here keeps its default.
      eventChoices: {
        type: 'array',
        label: 'Event ticks',
        fields: {
          add: {
            eventId: {
              type: 'string',
              label: 'Event',
              required: true
            },
            include: {
              type: 'boolean',
              label: 'In the bulletin'
            },
            membersOk: {
              type: 'boolean',
              label: 'Members-only: put it in the bulletin',
              def: false
            }
          }
        }
      }
    },
    group: {
      basics: {
        label: 'Bulletin',
        fields: [ 'weekOf', 'status', 'overflowOverride', 'eventChoices' ]
      },
      typed: {
        label: 'Typed boxes',
        fields: handSchema.map(([ key ]) => key)
      }
    }
  },
  handlers(self) {
    return {
      beforeSave: {
        titleAndDate(req, doc) {
          if (!DATE_RE.test(doc.weekOf || '')) {
            throw self.apos.error('invalid', 'Give the Sunday this bulletin is for.', { field: 'weekOf' });
          }
          doc.title = `Bulletin ${doc.weekOf}`;
        }
      },
      beforeInsert: {
        async oneAWeek(req, doc) {
          if (await self.apos.doc.db.findOne({
            type: self.name,
            weekOf: doc.weekOf
          })) {
            throw self.apos.error('invalid', 'There is already a bulletin for that Sunday.', { field: 'weekOf' });
          }
        }
      }
    };
  },
  methods(self) {
    const site = () => self.apos.modules['church-site'].options.site;
    const config = () => (site().bulletin || {});

    return {
      siteConfig() {
        return site();
      },
      sheetSite() {
        return {
          ...site(),
          tagline: config().tagline
        };
      },
      sections() {
        return logic.withSwitches(config().switches || {});
      },
      async findWeek(req, date) {
        return self.find(req, { weekOf: date }).toObject();
      },
      // Birthdays and anniversaries from the directory, as plain data. Only
      // read when the church has switched the section on.
      async directory(req) {
        const people = await self.apos.person.find(req).toArray();
        const links = await self.apos.personRelationship.find(req, { kind: 'spouse' }).toArray();
        const byId = new Map(people.map(person => [ person._id, person ]));
        return {
          people: people.map(person => ({
            id: person._id,
            name: `${person.preferredName || person.firstName} ${person.lastName}`,
            dateOfBirth: person.dateOfBirth,
            inactiveReason: person.inactiveReason,
            hiddenFields: person.hiddenFields
          })),
          relationships: links.map(link => {
            const a = byId.get((link.personAIds || [])[0]);
            const b = byId.get((link.personBIds || [])[0]);
            return {
              personA: a && a._id,
              personB: b && b._id,
              anniversary: link.anniversary,
              deceased: rules.relationshipDeceased([ a, b ])
            };
          })
        };
      },
      // The model for one week, from the saved bulletin (or a blank one) and
      // the church's records. `req` must be able to read people; the website
      // page uses an internal request and then filters by the switches.
      async model(req, date, doc) {
        const sections = self.sections();
        const birthdays = sections.find(section => section.id === 'birthdays');
        const wantDirectory = birthdays.print || birthdays.website;
        const standing = await self.apos.bulletinStanding.current(req);
        const sources = config().sources || {};
        // The published roster when there is one for these Sundays; until
        // then the church's demo source, or nothing.
        const rosterData = (self.apos.roster && await self.apos.roster.bulletinData(req, date)) ||
          (sources.roster
            ? sources.roster(date)
            : {
              assignments: [],
              names: {}
            });
        const directory = wantDirectory
          ? await self.directory(req)
          : {
            people: [],
            relationships: []
          };
        const hand = {};
        for (const [ key ] of handSchema) {
          if (doc && doc[key]) {
            hand[key] = doc[key];
          }
        }
        const eventChoices = {};
        for (const choice of (doc && doc.eventChoices) || []) {
          eventChoices[choice.eventId] = {
            include: choice.include,
            membersOk: choice.membersOk
          };
        }
        return logic.buildBulletin({
          weekOf: date,
          hand,
          standing,
          site: site(),
          assignments: rosterData.assignments,
          names: rosterData.names,
          events: sources.events ? sources.events(date) : [],
          eventChoices,
          includeBirthdays: wantDirectory,
          people: directory.people,
          relationships: directory.relationships,
          sections
        });
      },
      async save(req, date, { hand = {}, eventChoices = {} }) {
        const doc = await self.findWeek(req, date) || {
          ...self.newInstance(),
          title: `Bulletin ${date}`,
          weekOf: date
        };
        for (const [ key, field ] of handSchema) {
          if (typeof hand[key] === 'string') {
            doc[key] = field.type === 'date' && !DATE_RE.test(hand[key]) ? '' : hand[key];
          }
        }
        doc.eventChoices = Object.entries(eventChoices).map(([ eventId, choice ]) => ({
          _id: self.apos.util.generateId(),
          eventId: String(eventId),
          // `include` is absent on a members-only event: only membersOk is sent.
          include: choice.include !== false,
          membersOk: choice.membersOk === true
        }));
        doc.status = 'draft';
        doc.overflowOverride = false;
        return doc._id ? self.update(req, doc) : self.insert(req, doc);
      },
      // The rule for leaving draft: no panel may be full unless the office
      // says so. `overflow` is what the preview measured: [{ panel, lines }].
      async setStatus(req, date, {
        status, override = false, overflow = []
      }) {
        if (!STATUSES.includes(status)) {
          throw self.apos.error('invalid', 'Unknown status.');
        }
        const doc = await self.findWeek(req, date);
        if (!doc) {
          throw self.apos.error('notfound', 'Save the bulletin first.');
        }
        if (status === 'signedOff') {
          if (!Array.isArray(overflow) || !overflow.length) {
            throw self.apos.error('invalid', 'The preview has not measured the panels yet.');
          }
          const full = overflow.filter(item => item.lines > 0);
          if (full.length && override !== true) {
            throw self.apos.error('invalid', `Full: ${full.map(item => `${item.panel} by ${item.lines} line(s)`).join(', ')}. Shorten the text, or tick the box to sign off anyway.`);
          }
          doc.overflowOverride = full.length > 0;
        }
        doc.status = status;
        return self.update(req, doc);
      },
      adminOnly(req, res) {
        if (!self.apos.permission.isAdmin(req)) {
          res.status(req.user ? 403 : 404).send('Not found');
          return false;
        }
        return true;
      },
      validDate(req, res) {
        const date = req.params.date;
        if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
          res.status(404).send('Not found');
          return null;
        }
        return date;
      },
      // `fonts` and `logo` for a page. Screen pages link the fonts and the
      // logo; the PDF embeds both (`embed`), so it needs nothing from the site.
      async assets(req, { embed = false } = {}) {
        const church = self.apos.modules['church-site'];
        return {
          logo: await church.logo(req, { embed }),
          fontCss: church.fontFaceCss({ embed })
        };
      },
      async pdf(html) {
        // Same engine as the preview. playwright-core drives an installed
        // Google Chrome; BULLETIN_PDF_CHANNEL can name another channel.
        const { chromium } = require('playwright-core');
        const browser = await chromium.launch({ channel: process.env.BULLETIN_PDF_CHANNEL || 'chrome' });
        try {
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'load' });
          await page.evaluate(() => document.fonts.ready);
          return await page.pdf({
            width: `${logic.SHEET.widthIn}in`,
            height: `${logic.SHEET.heightIn}in`,
            printBackground: true,
            preferCSSPageSize: true,
            tagged: true
          });
        } finally {
          await browser.close();
        }
      },
      printHtml(view, { logo = null, fontCss = '' } = {}) {
        return logic.renderDocument({
          title: `Bulletin ${view.weekOf}`,
          head: `<style>${fontCss}\n${logic.sheetCss()}</style>`,
          body: logic.renderSheet(view, {
            site: self.sheetSite(),
            mode: 'print',
            logo
          }),
          script: logic.OVERFLOW_SCRIPT
        });
      }
    };
  },
  routes(self) {
    const safe = fn => async (req, res) => {
      try {
        await fn(req, res);
      } catch (error) {
        const status = {
          invalid: 400,
          notfound: 404,
          forbidden: 403
        }[error.name] || 500;
        if (status === 500) {
          self.apos.util.error(error);
        }
        res.status(status).json({ message: status === 500 ? 'Something went wrong.' : (error.data && error.data.message) || error.message });
      }
    };
    // Reads happen with an internal request so the public page can show a
    // signed-off bulletin; what it shows is cut down by viewFor.
    const internal = () => self.apos.task.getReq();

    return {
      get: {
        '/bulletin/:date': safe(async (req, res) => {
          const date = self.validDate(req, res);
          if (!date) {
            return;
          }
          const admin = self.apos.permission.isAdmin(req);
          const reader = internal();
          const doc = await self.findWeek(reader, date);
          if (!doc || (doc.status === 'draft' && !admin)) {
            return res.status(404).send('Not found');
          }
          const view = logic.viewFor(await self.model(reader, date, doc), 'website');
          const { logo, fontCss } = await self.assets(reader);
          res.set('Cache-Control', 'no-store');
          return res.send(logic.renderWebsite(view, {
            site: self.siteConfig(),
            demoBanner: req.t('church:demoBanner'),
            logo,
            head: `<style>${fontCss}</style>`
          }));
        }),
        '/bulletin/:date/edit': safe(async (req, res) => {
          const date = self.validDate(req, res);
          if (!date || !self.adminOnly(req, res)) {
            return;
          }
          const doc = await self.findWeek(req, date);
          const model = await self.model(req, date, doc);
          const { logo, fontCss } = await self.assets(req);
          res.set('Cache-Control', 'no-store');
          return res.send(renderEditor({
            logo,
            fontCss,
            model,
            doc,
            site: self.sheetSite(),
            date,
            csrfName: self.apos.csrfCookieName,
            demoBanner: req.t('church:demoBanner'),
            figuresDefault: logic.previousSunday(date)
          }));
        }),
        '/bulletin/:date/print': safe(async (req, res) => {
          const date = self.validDate(req, res);
          if (!date || !self.adminOnly(req, res)) {
            return;
          }
          const model = await self.model(req, date, await self.findWeek(req, date));
          res.set('Cache-Control', 'no-store');
          return res.send(self.printHtml(logic.viewFor(model, 'print'), await self.assets(req)));
        }),
        '/bulletin/:date/pdf': safe(async (req, res) => {
          const date = self.validDate(req, res);
          if (!date || !self.adminOnly(req, res)) {
            return;
          }
          const model = await self.model(req, date, await self.findWeek(req, date));
          const pdf = await self.pdf(self.printHtml(logic.viewFor(model, 'print'), await self.assets(req, { embed: true })));
          res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="bulletin-${date}.pdf"`,
            'Cache-Control': 'no-store'
          });
          return res.send(pdf);
        })
      },
      post: {
        '/bulletin/:date/save': safe(async (req, res) => {
          const date = self.validDate(req, res);
          if (!date || !self.adminOnly(req, res)) {
            return;
          }
          const doc = await self.save(req, date, req.body || {});
          return res.json({
            ok: true,
            status: doc.status
          });
        }),
        '/bulletin/:date/status': safe(async (req, res) => {
          const date = self.validDate(req, res);
          if (!date || !self.adminOnly(req, res)) {
            return;
          }
          const doc = await self.setStatus(req, date, req.body || {});
          return res.json({
            ok: true,
            status: doc.status
          });
        })
      }
    };
  }
};
