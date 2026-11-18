// The weekly tasks list (LGC-43), for the office only. Spec: the vault's
// weekly-tasks-poc note. The rules (the Monday-to-Sunday week in Chicago time,
// the template as at the week's start, carry-over, system items, who gets
// which reminder) are all in packages/tasks-logic; this module stores the
// results, shows them and sends the mail. It holds no date rules of its own.
//
// Storage, in plain collections (audited through church-audit's `record`):
//   taskTemplates  every version of the template, each with the instant it
//                  takes effect: an edit made during a week starts next week
//   taskWeeks      one document per week, _id = the Monday, holding its items.
//                  A past week is never rebuilt, so who did what stays on record
//   taskReminders  one row per address per day, claimed before the mail is
//                  sent so two runs can never send the same email twice
//
// Pages (office admin; anyone else gets 403, or 404 when signed out):
//   GET  /tasks                   this week's list
//   GET  /tasks/week/<monday>     any week kept (past weeks are read-only)
//   GET  /tasks/template          the template editor
//   POST /tasks/tick | /tasks/add | /tasks/owner | /tasks/template/save
//
// Calls for the MCP to wrap (LGC-47 or later): `list`, `tick`, `addOneOff`.
// They take the caller's `req`, so a tick is recorded under their own name.
//
// Where the system items come from: the site config's `tasks.sources
// .systemConditions(weekStart)` returns the live problems as
// [{ sourceKey, title, owner, dueDate }]. The events and Facebook work
// supplies it: a post in the "not posted" list, and an event announcing this
// week with no image or no contact. Until then the demo config stands in.
const logic = require('@church-system/tasks-logic');
const service = require('./lib/service.js');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REMINDER_HOUR = 7;
const TICK_EVERY_MS = 10 * 60 * 1000;

module.exports = {
  options: {
    alias: 'tasks',
    // Set by app.js: runs the daily job from a timer in the app process.
    // Off in tests, which call `runDaily` themselves.
    schedule: false,
    // Tests set a fixed clock, and a mailer; otherwise the sign-in module's.
    now: null,
    mail: null
  },
  init(self) {
    self.templates = self.apos.db.collection('taskTemplates');
    self.weeks = self.apos.db.collection('taskWeeks');
    self.reminders = self.apos.db.collection('taskReminders');
  },
  handlers(self) {
    return {
      'apostrophe:modulesRegistered': {
        async createIndexes() {
          await self.templates.createIndex({ effectiveFrom: 1 }, { unique: true });
          await self.reminders.createIndex({ date: 1 });
        }
      },
      'apostrophe:listen': {
        startTimer() {
          if (!self.options.schedule) {
            return;
          }
          const tick = () => self.runDaily().catch(error => self.apos.util.error(error));
          setTimeout(tick, 15000).unref();
          setInterval(tick, TICK_EVERY_MS).unref();
        }
      }
    };
  },
  methods(self) {
    const site = () => self.apos.modules['church-site'].options.site;
    const config = () => site().tasks || {};
    const internal = () => self.apos.task.getReq();

    return {
      now() {
        return self.options.now ? self.options.now() : new Date();
      },
      currentWeekStart() {
        return logic.weekOf(self.now()).weekStart;
      },
      mailer() {
        return self.options.mail || self.apos.churchSignin.mailer;
      },
      adminOnly(req, res) {
        if (!self.apos.permission.isAdmin(req)) {
          res.status(req.user ? 403 : 404).send('Not found');
          return false;
        }
        return true;
      },
      who(req) {
        return req && req.user ? req.user.title : null;
      },

      // ---- the audit trail -------------------------------------------------
      async audit(req, record, changes, personIds = []) {
        if (!changes.length) {
          return;
        }
        await self.apos.churchAudit.record(req, 'update', {
          type: record.type,
          _id: record._id,
          title: record.title,
          personIds
        }, changes);
      },

      // ---- the template ----------------------------------------------------
      async templateVersions() {
        if (!await self.templates.countDocuments()) {
          // The first version has always applied; ignore a lost race.
          await self.templates.insertOne({
            effectiveFrom: new Date(0),
            items: service.DEFAULT_TEMPLATE,
            by: null
          }).catch(error => {
            if (error.code !== 11000) {
              throw error;
            }
          });
        }
        return self.templates.find().sort({ effectiveFrom: 1 }).toArray();
      },
      // What the office edits: the newest version, which may be the one that
      // starts next week.
      async templateForEditing() {
        const versions = await self.templateVersions();
        const last = versions[versions.length - 1];
        return {
          items: last.items,
          startsNextWeek: last.effectiveFrom.getTime() > self.now().getTime(),
          nextWeekStart: logic.nextWeekStart(self.currentWeekStart())
        };
      },
      // An edit takes effect from next Monday and never touches this week.
      // Editing twice in a week replaces the pending version.
      async saveTemplate(req, rows) {
        const items = service.cleanTemplate(rows);
        await self.checkOwners(items.map(item => item.owner));
        const before = (await self.templateForEditing()).items;
        const effectiveFrom = logic.weekFromStart(logic.nextWeekStart(self.currentWeekStart())).startsAt;
        await self.templates.replaceOne({ effectiveFrom }, {
          effectiveFrom,
          items,
          by: self.who(req)
        }, { upsert: true });
        await self.audit(req, {
          type: 'task-template',
          _id: 'task-template',
          title: 'Weekly task template'
        }, service.itemChanges(
          before.map(item => ({
            id: item.key,
            ...item
          })),
          items.map(item => ({
            id: item.key,
            ...item
          }))
        ), items.map(item => item.owner).filter(Boolean));
        return items;
      },

      // ---- people ----------------------------------------------------------
      // The people who can own a task: the office.
      async officePeople() {
        const people = await self.apos.doc.db.find({
          type: 'person',
          officeAdmin: true,
          archived: { $ne: true }
        }).toArray();
        return people.map(person => ({
          id: person._id,
          name: `${person.preferredName || person.firstName} ${person.lastName}`,
          email: person.email || null,
          reminders: person.remindersOff !== true
        })).sort((a, b) => a.name.localeCompare(b.name));
      },
      async checkOwners(owners) {
        const ids = [ ...new Set(owners.filter(Boolean)) ];
        if (!ids.length) {
          return;
        }
        const known = new Set((await self.officePeople()).map(person => person.id));
        if (ids.some(id => !known.has(id))) {
          throw self.apos.error('invalid', 'An owner has to be someone in the office.');
        }
      },

      // ---- weeks -----------------------------------------------------------
      async findWeek(weekStart) {
        return self.weeks.findOne({ _id: weekStart });
      },
      async weekList() {
        return self.weeks.find({}, { projection: { _id: 1 } }).sort({ _id: -1 }).limit(104)
          .toArray()
          .then(rows => rows.map(row => row._id));
      },
      // This week's list: built on first need (the first visit, or the daily
      // job), from the template as at Monday 00:00 plus last week's unticked
      // items. Safe to call twice: the week's _id is its Monday.
      async ensureCurrentWeek() {
        const weekStart = self.currentWeekStart();
        const existing = await self.findWeek(weekStart);
        if (existing) {
          return existing;
        }
        const previous = await self.weeks.find({ _id: { $lt: weekStart } }).sort({ _id: -1 }).limit(1)
          .next();
        const doc = {
          _id: weekStart,
          weekStart,
          items: logic.buildWeek({
            weekStart,
            templateVersions: await self.templateVersions(),
            previousItems: previous ? previous.items : []
          }),
          rev: 0,
          builtAt: self.now()
        };
        try {
          await self.weeks.insertOne(doc);
          await self.audit(internal(), {
            type: 'task-week',
            _id: weekStart,
            title: `Tasks ${weekStart}`
          }, [ {
            field: 'week',
            old: null,
            new: `built with ${doc.items.length} items`
          } ]);
          return doc;
        } catch (error) {
          if (error.code === 11000) {
            return self.findWeek(weekStart);
          }
          throw error;
        }
      },
      // Compare-and-set, so two people ticking at once both land.
      async change(req, weekStart, fn) {
        if (weekStart !== self.currentWeekStart()) {
          throw self.apos.error('invalid', 'Only this week\'s list can be changed. Past weeks are a record.');
        }
        await self.ensureCurrentWeek();
        for (let attempt = 0; attempt < 5; attempt++) {
          const doc = await self.findWeek(weekStart);
          const items = fn(doc.items);
          const result = await self.weeks.updateOne({
            _id: weekStart,
            rev: doc.rev
          }, {
            $set: { items },
            $inc: { rev: 1 }
          });
          if (result.matchedCount) {
            await self.audit(req, {
              type: 'task-week',
              _id: weekStart,
              title: `Tasks ${weekStart}`
            }, service.itemChanges(doc.items, items), items.map(item => item.owner).filter(Boolean));
            return items;
          }
        }
        throw self.apos.error('conflict', 'The list changed while you were working. Try again.');
      },

      // ---- what the screens and the MCP call -------------------------------
      // A week's items, or null when no list was kept for it.
      async list(req, weekStart = self.currentWeekStart()) {
        if (!self.apos.permission.isAdmin(req)) {
          throw self.apos.error('forbidden');
        }
        const doc = weekStart === self.currentWeekStart()
          ? await self.ensureCurrentWeek()
          : await self.findWeek(weekStart);
        return doc
          ? {
            weekStart: doc.weekStart,
            items: doc.items
          }
          : null;
      },
      async tick(req, weekStart, id) {
        if (!self.apos.permission.isAdmin(req)) {
          throw self.apos.error('forbidden');
        }
        const at = self.now();
        const by = self.who(req);
        return self.change(req, weekStart, items => {
          if (!items.some(item => item.id === id)) {
            throw self.apos.error('notfound', 'No such task.');
          }
          return logic.tickItem(items, id, {
            by,
            at
          });
        });
      },
      async addOneOff(req, fields) {
        if (!self.apos.permission.isAdmin(req)) {
          throw self.apos.error('forbidden');
        }
        const weekStart = self.currentWeekStart();
        const day = service.cleanDay(fields.day);
        const owner = service.cleanOwner(fields.owner);
        await self.checkOwners([ owner ]);
        const item = service.newOneOff(weekStart, logic.dueDate(weekStart, day), {
          ...fields,
          owner
        });
        await self.change(req, weekStart, items => [ ...items, item ]);
        return item;
      },
      async setOwner(req, weekStart, id, ownerValue) {
        if (!self.apos.permission.isAdmin(req)) {
          throw self.apos.error('forbidden');
        }
        const owner = service.cleanOwner(ownerValue);
        await self.checkOwners([ owner ]);
        return self.change(req, weekStart, items => {
          if (!items.some(item => item.id === id)) {
            throw self.apos.error('notfound', 'No such task.');
          }
          return items.map(item => (item.id === id
            ? {
              ...item,
              owner
            }
            : item));
        });
      },

      // ---- system items ----------------------------------------------------
      // Brings the system items in line with the live problems. A system item
      // the office ticked in an earlier week stays accepted, so a Facebook
      // failure or an imageless event they waved through doesn't come back
      // every Monday. Call it after anything that could fix or cause a problem.
      async syncSystem(req = internal()) {
        const weekStart = self.currentWeekStart();
        const source = config().sources && config().sources.systemConditions;
        let conditions = [];
        if (source) {
          try {
            conditions = await source(weekStart);
          } catch (error) {
            // Resolving every item because the source failed would be wrong.
            self.apos.util.error('Could not read the live conditions for system tasks', error);
            return null;
          }
        }
        const at = self.now();
        const current = await self.ensureCurrentWeek();
        const previous = await self.weeks.find({ _id: { $lt: weekStart } }).sort({ _id: -1 }).limit(1)
          .next();
        const here = new Set(current.items.map(item => item.sourceKey).filter(Boolean));
        return self.change(req, weekStart, items => {
          const accepted = ((previous && previous.items) || []).filter(item =>
            item.kind === 'system' && item.done && !item.resolvedBySystem && !here.has(item.sourceKey));
          return logic.syncSystemItems([ ...items, ...accepted ], conditions, at)
            .filter(item => !accepted.includes(item));
        });
      },

      // ---- the morning job -------------------------------------------------
      // Builds the week, syncs system items, and after 07:00 Chicago time sends
      // the day's reminders. Safe to run as often as you like.
      async runDaily() {
        await self.ensureCurrentWeek();
        await self.syncSystem();
        if (service.chicagoHour(self.now()) < REMINDER_HOUR) {
          return [];
        }
        return self.sendReminders();
      },
      async sendReminders() {
        const today = logic.chicagoDate(self.now());
        const doc = await self.ensureCurrentWeek();
        const officeAddress = config().officeAddress || null;
        const people = {};
        for (const person of await self.officePeople()) {
          if (person.email) {
            people[person.id] = {
              email: person.email,
              reminders: person.reminders
            };
          }
        }
        // With no office address, unowned items have nowhere to go.
        const items = doc.items.filter(item =>
          officeAddress || (item.owner != null && people[item.owner]));
        const claimed = (await self.reminders.find({ date: today }).toArray()).map(row => row.to);
        const due = logic.remindersFor({
          items,
          today,
          people,
          officeAddress,
          alreadySent: claimed
        });
        const results = [];
        for (const reminder of due) {
          const _id = `${today}:${reminder.to}`;
          try {
            await self.reminders.insertOne({
              _id,
              date: today,
              to: reminder.to,
              itemIds: reminder.items.map(item => item.id),
              claimedAt: self.now()
            });
          } catch (error) {
            if (error.code === 11000) {
              continue;
            }
            throw error;
          }
          try {
            const result = await self.mailer().send({
              to: reminder.to,
              ...self.reminderMessage(reminder.items, today)
            });
            await self.reminders.updateOne({ _id }, {
              $set: {
                result: result.sent ? 'sent' : result.reason,
                sentAt: self.now()
              }
            });
            results.push({
              to: reminder.to,
              sent: result.sent
            });
          } catch (error) {
            // Let the next run try again.
            await self.reminders.deleteOne({ _id });
            self.apos.util.error('Could not send a task reminder', error);
          }
        }
        return results;
      },
      reminderMessage(items, today) {
        const t = (key, data) => self.apos.i18n.i18next.t(key, {
          lng: 'en',
          interpolation: { escapeValue: false },
          ...data
        });
        const lines = items.map(item => t(item.dueDate < today ? 'church:tasksReminderLineLate' : 'church:tasksReminderLine', {
          title: item.title,
          date: item.dueDate
        }));
        const base = self.apos.baseUrl ? new URL('/tasks', self.apos.baseUrl).toString() : '';
        return {
          subject: t('church:tasksReminderSubject', { count: items.length }),
          text: t('church:tasksReminderBody', {
            list: lines.join('\n'),
            url: base
          }).replace(/\n{3,}/g, '\n\n')
        };
      },

      // ---- the pages -------------------------------------------------------
      async page(req, template, data, status = 200) {
        req.res.set('Cache-Control', 'no-store');
        req.res.status(status);
        return self.sendPage(req, template, {
          csrfName: self.apos.csrfCookieName,
          ...data
        });
      },
      view(item, names) {
        return {
          ...item,
          ownerName: item.owner ? (names.get(item.owner) || item.owner) : '',
          doneAtText: service.stamp(item.doneAt),
          open: !item.done
        };
      },
      async weekPage(req, weekStart) {
        const current = self.currentWeekStart();
        const doc = weekStart === current ? await self.ensureCurrentWeek() : await self.findWeek(weekStart);
        const people = await self.officePeople();
        const names = new Map(people.map(person => [ person.id, person.name ]));
        const kept = await self.weekList();
        const older = kept.find(date => date < weekStart) || null;
        const newer = kept.slice().reverse().find(date => date > weekStart && date <= current) || null;
        const items = doc ? doc.items.map(item => self.view(item, names)) : [];
        // Not-done first, then by due date.
        items.sort((a, b) => Number(a.done) - Number(b.done) ||
          String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
        return self.page(req, 'list', {
          weekStart,
          weekEnd: logic.weekFromStart(weekStart).weekEnd,
          isCurrent: weekStart === current,
          kept: Boolean(doc),
          items,
          people,
          older,
          newer,
          openCount: items.filter(item => !item.done).length,
          days: self.dayChoices(req),
          currentWeek: current
        });
      },
      dayChoices(req) {
        return logic.WEEKDAYS.map(value => ({
          value,
          label: req.t(`church:tasksDay_${value}`)
        }));
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
          forbidden: 403,
          conflict: 409
        }[error.name] || 500;
        if (status === 500) {
          self.apos.util.error(error);
        }
        res.status(status).json({ message: status === 500 ? 'Something went wrong.' : (error.data && error.data.message) || error.message });
      }
    };
    const office = fn => safe(async (req, res) => {
      if (self.adminOnly(req, res)) {
        await fn(req, res);
      }
    });
    const body = req => req.body || {};
    const week = req => {
      const weekStart = body(req).weekStart;
      return typeof weekStart === 'string' && DATE_RE.test(weekStart) ? weekStart : self.currentWeekStart();
    };

    return {
      get: {
        '/tasks/client.js': (req, res) => {
          res.type('application/javascript').send(CLIENT);
        },
        '/tasks/template': office(async (req, res) => {
          const template = await self.templateForEditing();
          const rows = template.items.concat([ {}, {}, {} ]);
          return self.page(req, 'template', {
            rows,
            people: await self.officePeople(),
            days: self.dayChoices(req),
            startsNextWeek: template.startsNextWeek,
            nextWeekStart: template.nextWeekStart
          });
        }),
        '/tasks': office(async (req, res) => self.weekPage(req, self.currentWeekStart())),
        '/tasks/week/:weekStart': office(async (req, res) => {
          const weekStart = req.params.weekStart;
          let valid = DATE_RE.test(weekStart);
          try {
            logic.weekFromStart(weekStart);
          } catch (error) {
            valid = false;
          }
          if (!valid || weekStart > self.currentWeekStart()) {
            return res.status(404).send('Not found');
          }
          return self.weekPage(req, weekStart);
        })
      },
      post: {
        '/tasks/tick': office(async (req, res) => {
          await self.tick(req, week(req), body(req).id);
          return res.json({ ok: true });
        }),
        '/tasks/add': office(async (req, res) => {
          const item = await self.addOneOff(req, body(req));
          return res.json({
            ok: true,
            id: item.id
          });
        }),
        '/tasks/owner': office(async (req, res) => {
          await self.setOwner(req, week(req), body(req).id, body(req).owner);
          return res.json({ ok: true });
        }),
        '/tasks/template/save': office(async (req, res) => {
          await self.saveTemplate(req, body(req).items);
          return res.json({ ok: true });
        })
      }
    };
  },
  tasks(self) {
    return {
      daily: {
        usage: 'Build this week\'s list, sync the system items and, after 07:00 Chicago time, send the day\'s reminders. Safe to run often.\n\nnode app tasks:daily',
        async task() {
          const sent = await self.runDaily();
          // eslint-disable-next-line no-console
          console.log(`Reminders sent: ${sent.filter(result => result.sent).length}.`);
        }
      }
    };
  }
};

// The page's script. Served from a route, not inlined, so the templates hold
// no code. Every button posts JSON with Apostrophe's CSRF token.
const CLIENT = `
(function () {
  var root = document.querySelector('[data-tasks]');
  if (!root) { return; }
  var csrf = root.getAttribute('data-csrf');
  function token() {
    var m = document.cookie.split('; ').filter(function (c) { return c.indexOf(csrf + '=') === 0; })[0];
    return m ? decodeURIComponent(m.split('=')[1]) : '';
  }
  function say(text) { var el = document.querySelector('[data-message]'); if (el) { el.textContent = text; } }
  function post(path, body) {
    return fetch(path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token() },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) { throw new Error(j.message || r.status); } return j; });
    });
  }
  function run(promise) {
    promise.then(function () { location.reload(); })
      .catch(function (e) { say(root.getAttribute('data-failed') + ' ' + e.message); });
  }
  var weekStart = root.getAttribute('data-week');
  document.querySelectorAll('[data-tick]').forEach(function (btn) {
    btn.addEventListener('click', function () { run(post('/tasks/tick', { weekStart: weekStart, id: btn.getAttribute('data-tick') })); });
  });
  document.querySelectorAll('[data-owner-for]').forEach(function (sel) {
    sel.addEventListener('change', function () {
      run(post('/tasks/owner', { weekStart: weekStart, id: sel.getAttribute('data-owner-for'), owner: sel.value }));
    });
  });
  var add = document.querySelector('[data-add-form]');
  if (add) {
    add.addEventListener('submit', function (e) {
      e.preventDefault();
      run(post('/tasks/add', {
        title: add.elements.title.value, day: add.elements.day.value, owner: add.elements.owner.value
      }));
    });
  }
  var tpl = document.querySelector('[data-template-form]');
  if (tpl) {
    tpl.addEventListener('submit', function (e) {
      e.preventDefault();
      var items = [];
      tpl.querySelectorAll('[data-row]').forEach(function (row) {
        var title = row.querySelector('[data-title]').value.trim();
        if (!title || row.querySelector('[data-remove]').checked) { return; }
        items.push({
          key: row.getAttribute('data-key') || undefined, title: title,
          day: row.querySelector('[data-day]').value, owner: row.querySelector('[data-owner]').value
        });
      });
      run(post('/tasks/template/save', { items: items }));
    });
  }
})();
`;
