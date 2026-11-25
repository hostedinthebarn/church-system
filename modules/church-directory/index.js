// The members directory (LGC-46): search and browse by household, household
// pages, "edit my household" for members and edit-anyone for the office, the
// change history for the office, and the Download PDF. What each person may
// see and change is decided by lib/directory.js and lib/rules.js; this module
// is the Apostrophe side: the pages, the records and the session.
//
// Members are Apostrophe `guest` users who can't touch the record types
// directly (those are office-admin only). Their edits are saved on their
// behalf through a system request, with `actingUser` set so the audit trail
// names the member who made the change.
const crypto = require('node:crypto');
const rules = require('../../lib/rules.js');
const directory = require('../../lib/directory.js');
const { canSignIn } = require('../../lib/signin.js');
const { renderPdf } = require('../../lib/directory-pdf.js');
const demo = require('../../lib/demo-data.js');

const BASE = '/members';
const LAYOUTS = [ 'a', 'b' ];
const FORM_FIELDS = [ 'firstName', 'lastName', 'preferredName', 'dateOfBirth', 'cellphone', 'email' ];

module.exports = {
  options: {
    alias: 'churchDirectory',
    // The edit and sign-out forms are plain HTML forms, so they carry their
    // own token (see checkToken) instead of Apostrophe's header.
    csrfExceptions: [ `${BASE}/household/*/edit`, `${BASE}/sign-out` ],
    // Layout A shows family photos, B is a phone book. B is the default until
    // a household has a photo; then A is.
    defaultLayout: null,
    // Adults' birthdays in the PDF: the church has not said (Brynna, 11-12).
    adultBirthdaysInPdf: null
  },
  handlers(self) {
    return {
      // Who is signed in, for the members' toolbar on every page: the name,
      // their household and the token the Sign out form posts.
      '@apostrophecms/page:beforeSend': {
        async memberBar(req) {
          if (!req.user || !req.session) {
            return;
          }
          const viewer = await self.viewerFor(req.user);
          if (viewer) {
            req.data.memberBar = {
              // People are stored "Sample, Sam" for the directory's order; a
              // greeting reads first name first.
              name: String(viewer.name || '').replace(/^([^,]+),\s*(.+)$/, '$2 $1'),
              office: viewer.role === 'admin',
              householdId: viewer.householdId,
              token: self.token(req)
            };
          }
        }
      },
      'apostrophe:ready': {
        async seedDemo() {
          const mode = process.env.CHURCH_SEED_DEMO;
          if (mode === '1' || mode === 'reset') {
            await self.seedDemo({ reset: mode === 'reset' });
          }
        }
      }
    };
  },
  routes(self) {
    return {
      get: {
        [BASE]: (req, res) => res.redirect(`${BASE}/directory`),
        [`${BASE}/directory`]: async (req, res) => {
          const viewer = await self.requireViewer(req, res);
          if (!viewer) {
            return null;
          }
          return self.browsePage(req, viewer);
        },
        [`${BASE}/directory.pdf`]: async (req, res) => {
          const viewer = await self.requireViewer(req, res);
          if (!viewer) {
            return null;
          }
          return self.sendDirectoryPdf(req, res);
        },
        [`${BASE}/household/:id`]: async (req, res) => {
          const viewer = await self.requireViewer(req, res);
          if (!viewer) {
            return null;
          }
          return self.householdPage(req, viewer, req.params.id);
        },
        [`${BASE}/household/:id/edit`]: async (req, res) => {
          const viewer = await self.requireViewer(req, res);
          if (!viewer) {
            return null;
          }
          return self.editPage(req, viewer, req.params.id);
        }
      },
      post: {
        [`${BASE}/household/:id/edit`]: async (req, res) => {
          const viewer = await self.requireViewer(req, res);
          if (!viewer) {
            return null;
          }
          if (!self.checkToken(req)) {
            return self.page(req, viewer, 'notAllowed', {}, 403);
          }
          return self.saveEdit(req, viewer, req.params.id);
        },
        [`${BASE}/sign-out`]: async (req, res) => {
          if (!self.checkToken(req)) {
            return res.status(403).send('Forbidden');
          }
          await new Promise(resolve => req.session.destroy(resolve));
          return res.redirect('/');
        }
      }
    };
  },
  methods(self) {
    return {
      // ---------- who is asking ----------

      // The signed-in person as the rules want them, or null (and a redirect
      // to sign-in, or a plain refusal) when they may not use the directory.
      async requireViewer(req, res) {
        req.res.set('Cache-Control', 'no-store');
        if (!req.user) {
          res.redirect('/sign-in');
          return null;
        }
        const viewer = await self.viewerFor(req.user);
        if (!viewer) {
          res.status(403);
          await self.page(req, null, 'notAllowed', {}, 403);
          return null;
        }
        return viewer;
      },
      async viewerFor(user) {
        const person = user.personId
          ? await self.apos.doc.db.findOne({
            _id: user.personId,
            type: 'person',
            archived: { $ne: true }
          })
          : null;
        if (user.role === 'admin') {
          return {
            role: 'admin',
            name: user.title,
            personId: person ? person._id : null,
            householdId: person ? directory.householdIdOf(person) : null,
            isAdult: true
          };
        }
        // Checked on every request: the person may have become inactive since
        // they signed in.
        if (!person || !canSignIn(person, rules.todayIso())) {
          return null;
        }
        return {
          role: 'guest',
          name: person.title,
          personId: person._id,
          householdId: directory.householdIdOf(person),
          isAdult: true
        };
      },
      token(req) {
        if (!req.session.churchCsrf) {
          req.session.churchCsrf = crypto.randomBytes(24).toString('base64url');
        }
        return req.session.churchCsrf;
      },
      checkToken(req) {
        const sent = Buffer.from(String((req.body && req.body.token) || ''));
        const have = Buffer.from(String((req.session && req.session.churchCsrf) || ''));
        return have.length > 0 && sent.length === have.length && crypto.timingSafeEqual(sent, have);
      },

      // ---------- records ----------

      async snapshot() {
        const find = type => self.apos.doc.db.find({
          type,
          archived: { $ne: true }
        }).toArray();
        const [ households, people, relationships, groups ] = await Promise.all([
          find('household'),
          find('person'),
          find('person-relationship'),
          find('group')
        ]);
        return {
          households,
          people,
          relationships,
          groups
        };
      },
      async photoUrls(households) {
        const ids = households.flatMap(household => household.photoIds || []);
        const urls = new Map();
        if (!ids.length) {
          return urls;
        }
        const images = await self.apos.doc.db.find({
          aposDocId: { $in: ids },
          type: '@apostrophecms/image',
          aposMode: 'published'
        }).toArray();
        for (const household of households) {
          const image = images.find(item => item.aposDocId === (household.photoIds || [])[0]);
          if (image && image.attachment) {
            urls.set(household._id, self.apos.attachment.url(image.attachment, { size: 'one-third' }));
          }
        }
        return urls;
      },

      // ---------- wording and dates ----------

      translator(req) {
        const i18next = self.apos.i18n.i18next;
        return (key, options = {}) => i18next.t(`church:${key}`, {
          lng: req.locale,
          interpolation: { escapeValue: false },
          ...options
        });
      },
      monthDay(value, locale) {
        const match = /^(\d{2})-(\d{2})$/.exec(value || '');
        if (!match) {
          return '';
        }
        return new Date(Date.UTC(2000, Number(match[1]) - 1, Number(match[2])))
          .toLocaleDateString(locale, {
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC'
          });
      },
      fullDate(iso, locale) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) {
          return '';
        }
        return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC'
        });
      },
      dateTime(date, locale) {
        return new Date(date).toLocaleString(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: self.timeZone()
        });
      },
      timeZone() {
        const site = self.apos.modules['church-site'];
        return (site && site.options.site && site.options.site.timeZone) || 'America/Chicago';
      },
      site() {
        const site = self.apos.modules['church-site'];
        return (site && site.options.site) || {};
      },

      // ---------- pages ----------

      async page(req, viewer, template, data, status = 200) {
        req.res.set('Cache-Control', 'no-store');
        req.res.status(status);
        const t = self.translator(req);
        return self.sendPage(req, template, {
          ...data,
          nav: viewer
            ? {
              name: viewer.name,
              office: viewer.role === 'admin',
              householdId: viewer.householdId,
              token: self.token(req)
            }
            : null,
          t
        });
      },
      defaultLayoutFor(households) {
        return self.options.defaultLayout ||
          (households.some(household => (household.photoIds || []).length) ? 'a' : 'b');
      },
      async browsePage(req, viewer) {
        const snapshot = await self.snapshot();
        const query = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
        const asked = typeof req.query.layout === 'string' ? req.query.layout : '';
        const layout = LAYOUTS.includes(asked) ? asked : self.defaultLayoutFor(snapshot.households);
        const office = viewer.role === 'admin';
        const include = office
          ? {
            inactive: req.query.inactive === '1',
            visitors: req.query.visitors === '1',
            optedOut: req.query.optedOut === '1'
          }
          : {};
        const rows = directory.directoryRows({
          viewer,
          snapshot,
          query,
          include
        });
        const photos = layout === 'a' ? await self.photoUrls(snapshot.households) : new Map();
        for (const row of rows) {
          row.photoUrl = photos.get(row.id) || '';
          row.initials = row.surname.slice(0, 2);
        }
        const letters = directory.groupByLetter(rows);
        const present = new Set(letters.map(group => group.letter));
        return self.page(req, viewer, 'directory', {
          rows,
          letters,
          rail: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => ({
            letter,
            present: present.has(letter)
          })),
          query,
          layout,
          otherLayout: layout === 'a' ? 'b' : 'a',
          include,
          office,
          searching: Boolean(query)
        });
      },
      async householdPage(req, viewer, id) {
        const snapshot = await self.snapshot();
        const household = snapshot.households.find(item => item._id === id);
        const view = household && directory.householdView({
          viewer,
          household,
          snapshot
        });
        if (!view) {
          return self.page(req, viewer, 'notFound', {}, 404);
        }
        const locale = req.locale;
        for (const person of view.people) {
          person.birthdayText = self.monthDay(person.birthday, locale);
          person.dateOfBirthText = self.fullDate(person.dateOfBirth, locale);
          person.baptismText = self.fullDate(person.baptismDate, locale);
          for (const relation of person.relations) {
            relation.anniversaryText = viewer.role === 'admin'
              ? self.fullDate(relation.anniversary, locale)
              : self.monthDay((relation.anniversary || '').slice(5), locale);
          }
        }
        const stamp = await self.lastUpdate(view);
        const history = viewer.role === 'admin' ? await self.history(view, locale) : [];
        const saved = self.apos.launder.integer(req.query.saved, -1, -1, 1000);
        const photos = await self.photoUrls([ household ]);
        return self.page(req, viewer, 'household', {
          household: view,
          photoUrl: photos.get(household._id) || '',
          updated: stamp && (view.own || view.office)
            ? {
              by: stamp.by && stamp.by.title,
              date: self.fullDate(stamp.at.toISOString().slice(0, 10), locale)
            }
            : null,
          history,
          saved: saved >= 0 ? saved : null
        });
      },
      // The newest entry made by a person, for "last updated by".
      async lastUpdate(view) {
        const ids = [ view.id, ...view.people.map(person => person.id) ];
        return self.apos.churchAudit.collection.find({
          recordId: { $in: ids },
          by: { $ne: null }
        }).sort({ at: -1 }).limit(1).next();
      },
      // The change history for the office: every entry about the household or
      // its people, newest first.
      async history(view, locale) {
        const people = await self.apos.doc.db.find({
          type: 'person',
          householdIds: view.id
        }).project({ _id: 1 }).toArray();
        const rows = await self.apos.churchAudit.collection.find({
          recordId: { $in: [ view.id, ...people.map(person => person._id) ] }
        }).sort({ at: -1 }).limit(100).toArray();
        return rows.map(entry => ({
          when: self.dateTime(entry.at, locale),
          by: entry.by ? entry.by.title : '',
          action: entry.action,
          record: entry.recordTitle || '',
          redacted: Boolean(entry.redacted),
          changes: (entry.action !== 'update' ? [] : entry.changes || []).map(change => ({
            field: change.field,
            old: directory.formatChangeValue(change.old),
            new: directory.formatChangeValue(change.new)
          }))
        }));
      },

      // ---------- the edit form ----------

      async editContext(viewer, id) {
        const snapshot = await self.snapshot();
        const household = snapshot.households.find(item => item._id === id);
        if (!household || !rules.canEditHousehold(viewer, id)) {
          return null;
        }
        const today = rules.todayIso();
        const office = viewer.role === 'admin';
        const people = snapshot.people
          .filter(person => directory.householdIdOf(person) === id)
          .filter(person => office || !rules.isInactive(person))
          .sort((a, b) => Number(rules.isMinor(a.dateOfBirth, today)) - Number(rules.isMinor(b.dateOfBirth, today)) ||
            String(a.dateOfBirth).localeCompare(String(b.dateOfBirth)));
        // A household with no adults is edited by the office only.
        if (!office && !people.some(person => !rules.isMinor(person.dateOfBirth, today))) {
          return null;
        }
        return {
          household,
          people,
          office,
          today
        };
      },
      // The form's fields, with what was typed (or what is stored) and any
      // error for each.
      formModel({
        household, people, office, today
      }, body, errors, t) {
        const errorFor = name => {
          const found = errors.find(error => error.field === name);
          return found ? t(found.key) : '';
        };
        const value = (name, stored) => (body && body[name] !== undefined ? body[name] : stored || '');
        const checked = (name, stored) => (body ? body[name] === 'on' : Boolean(stored));
        const address = household.address || {};
        return {
          office,
          title: {
            value: value('title', household.title),
            error: errorFor('title')
          },
          autoName: checked('autoName', household.autoName !== false),
          directoryOptOut: checked('directoryOptOut', household.directoryOptOut),
          homePhone: value('homePhone', household.homePhone),
          street: value('street', address.street),
          city: value('city', address.city),
          state: value('state', address.state),
          zip: value('zip', address.zip),
          people: people.map(person => {
            const prefix = `p.${person._id}.`;
            const minor = rules.isMinor(person.dateOfBirth, today);
            const hidden = person.hiddenFields || [];
            const fields = {};
            for (const name of FORM_FIELDS) {
              fields[name] = {
                name: `${prefix}${name}`,
                id: `f-${person._id}-${name}`,
                value: value(`${prefix}${name}`, person[name]),
                error: errorFor(`${prefix}${name}`)
              };
            }
            const hide = {};
            for (const name of directory.HIDEABLE) {
              hide[name] = {
                name: `${prefix}hide.${name}`,
                id: `f-${person._id}-hide-${name}`,
                checked: checked(`${prefix}hide.${name}`, hidden.includes(name))
              };
            }
            return {
              id: person._id,
              name: directory.fullName(person),
              minor,
              self: false,
              fields,
              hide,
              status: {
                name: `${prefix}status`,
                id: `f-${person._id}-status`,
                value: value(`${prefix}status`, person.status || 'member')
              },
              inactiveReason: {
                name: `${prefix}inactiveReason`,
                id: `f-${person._id}-inactive`,
                value: value(`${prefix}inactiveReason`, person.inactiveReason || '')
              }
            };
          })
        };
      },
      async editPage(req, viewer, id, {
        body = null, errors = [], status = 200
      } = {}) {
        const context = await self.editContext(viewer, id);
        if (!context) {
          return self.page(req, viewer, 'notAllowed', { householdId: id }, 403);
        }
        const t = self.translator(req);
        const form = self.formModel(context, body, errors, t);
        for (const person of form.people) {
          person.self = person.id === viewer.personId;
        }
        return self.page(req, viewer, 'edit', {
          householdId: id,
          householdName: context.household.title,
          form,
          hasErrors: errors.length > 0
        }, status);
      },
      async saveEdit(req, viewer, id) {
        const context = await self.editContext(viewer, id);
        if (!context) {
          return self.page(req, viewer, 'notAllowed', { householdId: id }, 403);
        }
        const patch = directory.parseHouseholdEdit({
          body: req.body || {},
          household: context.household,
          people: context.people,
          office: context.office,
          today: context.today
        });
        if (patch.errors.length) {
          return self.editPage(req, viewer, id, {
            body: req.body,
            errors: patch.errors,
            status: 422
          });
        }
        try {
          const count = await self.applyEdit(req, context, patch);
          return req.res.redirect(`${BASE}/household/${encodeURIComponent(id)}?saved=${count}`);
        } catch (error) {
          if (error && error.code === 'EMAIL_TAKEN') {
            return self.editPage(req, viewer, id, {
              body: req.body,
              errors: [ {
                key: 'errorEmailTaken',
                field: `p.${error.personId}.email`
              } ],
              status: 422
            });
          }
          throw error;
        }
      },
      // Saves what changed, as the signed-in person. Returns how many fields
      // changed. The edits go through a system request because members can't
      // write the record types themselves; the audit trail still names them.
      async applyEdit(req, context, patch) {
        const system = self.apos.task.getReq();
        system.actingUser = req.user;
        let count = 0;
        // Emails first, so a clash stops the save before anything is written.
        for (const change of patch.people) {
          if (change.set.email) {
            const other = await self.apos.doc.db.findOne({
              type: 'person',
              email: change.set.email,
              _id: { $ne: change.id }
            });
            if (other) {
              throw Object.assign(new Error('That email already belongs to another person.'), {
                code: 'EMAIL_TAKEN',
                personId: change.id
              });
            }
          }
        }
        for (const change of patch.people) {
          const doc = await self.apos.doc.db.findOne({
            _id: change.id,
            type: 'person'
          });
          const set = directory.changedFields(doc, change.set);
          if (!Object.keys(set).length) {
            continue;
          }
          Object.assign(doc, set);
          await self.apos.person.update(system, doc);
          count += Object.keys(set).length;
        }
        const household = await self.apos.doc.db.findOne({
          _id: context.household._id,
          type: 'household'
        });
        const next = {};
        if (Object.keys(directory.changedFields(household.address || {}, patch.household.address)).length) {
          next.address = {
            ...household.address,
            ...patch.household.address
          };
        }
        for (const key of [ 'homePhone', 'directoryOptOut', 'title', 'autoName' ]) {
          if (patch.household[key] !== undefined &&
            JSON.stringify(patch.household[key]) !== JSON.stringify(household[key] === undefined ? '' : household[key])) {
            next[key] = patch.household[key];
          }
        }
        // Typing a new name takes the name over from the generator.
        if (next.title !== undefined && next.autoName === undefined && household.autoName !== false) {
          next.autoName = false;
        }
        if (Object.keys(next).length) {
          Object.assign(household, next);
          await self.apos.household.update(system, household);
          count += Object.keys(next).length;
        }
        if (next.autoName === true) {
          await self.apos.household.refreshName(system, household._id);
        }
        return count;
      },

      // ---------- the PDF ----------

      async sendDirectoryPdf(req, res) {
        const snapshot = await self.snapshot();
        const locale = req.locale;
        const t = self.translator(req);
        const configured = self.options.adultBirthdaysInPdf;
        const site = self.site();
        const adultBirthdays = configured !== null
          ? configured
          : !(site.directory && site.directory.adultBirthdaysInPdf === false);
        const entries = directory.pdfEntries({
          snapshot,
          adultBirthdays
        });
        const month = new Date().toLocaleDateString(locale, {
          month: 'long',
          year: 'numeric',
          timeZone: self.timeZone()
        });
        const buffer = await renderPdf({
          entries,
          compress: process.env.CHURCH_PDF_COMPRESS !== '0',
          birthday: value => self.monthDay(value, locale),
          labels: {
            title: t('pdfTitle', { church: site.name || '' }),
            subtitle: month,
            footerLeft: t('pdfFooterLeft', { church: site.name || '' }),
            footerRight: t('pdfFooterRight'),
            home: phone => t('pdfHome', { phone }),
            married: date => t('pdfMarried', { date }),
            children: names => t('pdfChildren', { names }),
            born: date => t('pdfBorn', { date })
          }
        });
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="directory.pdf"',
          'Cache-Control': 'no-store'
        });
        return res.send(buffer);
      },

      // ---------- demo data ----------

      async seedDemo({ reset = false } = {}) {
        return demo.seed(self.apos, { reset });
      }
    };
  },
  tasks(self) {
    return {
      'seed-demo': {
        usage: 'Fill an empty database with made-up households for the demo.\n\nnode app church-directory:seed-demo [--reset]\n\n--reset first deletes every household, person, relationship, group, office note and away date, the sign-in users made from them and the audit trail. Only ever run it on demo data.',
        async task(argv) {
          const result = await self.seedDemo({ reset: Boolean(argv.reset) });
          // eslint-disable-next-line no-console
          console.log(result.seeded
            ? `Seeded ${result.households} households and ${result.people} people.`
            : 'The database already has households; nothing seeded. Use --reset to start over.');
        }
      }
    };
  }
};
