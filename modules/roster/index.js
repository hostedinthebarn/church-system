// The servers roster (LGC-44). The rotation and the checks are in
// packages/roster-logic; this is the Apostrophe side: one record per month, the
// office screens, and the emails.
//
// Screens (office admin only; the coordinator is the office role in the POC):
//   GET  /roster                  the coming months and their state
//   GET  /roster/<YYYY-MM>        the suggested (or saved) month: adjust it
//   GET  /roster/<YYYY-MM>/print  the printable list
//   POST /roster/<YYYY-MM>/save   keep the adjusted month as a draft
//   POST /roster/<YYYY-MM>/publish   publish it and send the monthly email
//   POST /roster/<YYYY-MM>/swap   change slots after publishing; email only
//                                 the people a change touches
//
// A published month feeds the bulletin's "Those Serving" (bulletinData).
const logic = require('@church-system/roster-logic');
const rules = require('../../lib/rules.js');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const slotName = (role, date, slot) => `s_${role}_${date || 'month'}_${slot}`;

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

module.exports = {
  extend: '@apostrophecms/piece-type',
  options: {
    alias: 'roster',
    shortcut: 'G,L',
    label: 'Roster',
    pluralLabel: 'Rosters',
    localized: false,
    viewRole: 'admin',
    editRole: 'admin',
    publishRole: 'admin',
    searchable: false,
    // Set in tests; otherwise the sign-in module's mail interface is used.
    mail: null
  },
  fields: {
    add: {
      title: {
        type: 'string',
        label: 'Title',
        readOnly: true
      },
      month: {
        type: 'string',
        label: 'Month (YYYY-MM)',
        required: true
      },
      // Moves only through the publish route.
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
            label: 'Published',
            value: 'published'
          }
        ]
      },
      publishedAt: {
        type: 'string',
        label: 'Published at',
        readOnly: true
      }
    },
    group: {
      basics: {
        label: 'Roster',
        fields: [ 'month', 'status', 'publishedAt' ]
      }
    }
  },
  handlers(self) {
    return {
      beforeSave: {
        titleAndMonth(req, doc) {
          if (!MONTH_RE.test(doc.month || '')) {
            throw self.apos.error('invalid', 'Give the month as YYYY-MM.', { field: 'month' });
          }
          doc.title = `Roster ${doc.month}`;
        }
      },
      beforeInsert: {
        async oneAMonth(req, doc) {
          if (await self.apos.doc.db.findOne({
            type: self.name,
            month: doc.month
          })) {
            throw self.apos.error('invalid', 'There is already a roster for that month.', { field: 'month' });
          }
        }
      }
    };
  },
  methods(self) {
    const db = () => self.apos.doc.db;
    const personName = person => `${person.preferredName || person.firstName} ${person.lastName}`;

    return {
      mailer() {
        const mailer = self.options.mail || (self.apos.churchSignin && self.apos.churchSignin.mailer);
        if (!mailer) {
          throw new Error('The roster needs the mail interface (church-signin) to send email.');
        }
        return mailer;
      },
      // The roles as roster-logic takes them, plus the names of every person
      // who might appear. `eligible` is the serving group's active members,
      // in surname order (that is the tie-break order of the rotation).
      async rolesAndNames() {
        const roleDocs = await db().find({ type: 'serving-role' }).toArray();
        roleDocs.sort((a, b) => (a.order - b.order) || a.title.localeCompare(b.title));
        const groupIds = roleDocs.flatMap(role => role.groupIds || []);
        const groups = await db().find({
          type: 'group',
          _id: { $in: groupIds }
        }).toArray();
        const memberIds = groups.flatMap(group => group.membersIds || []);
        const people = await db().find({
          type: 'person',
          _id: { $in: memberIds },
          archived: { $ne: true }
        }).toArray();
        const active = people
          .filter(person => !rules.isInactive(person))
          .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
        const names = Object.fromEntries(people.map(person => [ person._id, personName(person) ]));
        const roles = roleDocs.map(role => {
          const group = groups.find(item => item._id === (role.groupIds || [])[0]);
          const members = new Set((group && group.membersIds) || []);
          return {
            id: role.roleKey,
            name: role.title,
            slots: role.slots,
            period: role.period,
            eligible: active.filter(person => members.has(person._id)).map(person => person._id)
          };
        });
        return {
          roles,
          names
        };
      },
      // Away spans overlapping the month, as roster-logic's per-Sunday list.
      async awayFor(month) {
        const spans = await db().find({
          type: 'away-date',
          startDate: { $lte: `${month}-31` },
          endDate: { $gte: `${month}-01` }
        }).toArray();
        const list = spans.map(span => ({
          person: (span.personIds || [])[0],
          startDate: span.startDate,
          endDate: span.endDate
        })).filter(span => span.person);
        return {
          list,
          sundays: logic.awaySundays(list, month)
        };
      },
      // Who served what, from the published months other than this one. A
      // monthly role counts as its month's last Sunday.
      async history(month) {
        const docs = await db().find({
          type: self.name,
          status: 'published',
          month: { $ne: month }
        }).toArray();
        return docs.flatMap(doc => (doc.assignments || [])
          .filter(entry => entry.person)
          .map(entry => ({
            role: entry.role,
            person: entry.person,
            date: entry.date || logic.sundaysOf(doc.month).at(-1)
          })));
      },
      async findMonth(req, month) {
        return self.find(req, { month }).toObject();
      },
      // The month as the screen shows it: the saved roster, or the suggestion
      // when none is saved yet, with its warnings.
      async view(req, month) {
        const { roles, names } = await self.rolesAndNames();
        const away = await self.awayFor(month);
        const doc = await self.findMonth(req, month);
        let assignments;
        let suggestionWarnings = [];
        if (doc) {
          assignments = doc.assignments || [];
        } else {
          const suggested = logic.suggestRoster({
            month,
            roles,
            away: away.sundays,
            history: await self.history(month)
          });
          assignments = suggested.assignments;
          suggestionWarnings = suggested.warnings;
        }
        for (const entry of assignments) {
          if (entry.person && !names[entry.person]) {
            const person = await db().findOne({
              type: 'person',
              _id: entry.person
            });
            names[entry.person] = person ? personName(person) : entry.person;
          }
        }
        const warnings = logic.checkRoster({
          month,
          roles,
          assignments,
          away: away.sundays,
          names
        });
        return {
          doc,
          roles,
          names,
          assignments,
          warnings,
          suggestionWarnings,
          away
        };
      },
      // What the form sent, as an assignment list. Every slot the roles
      // define is there, empty when nothing was chosen; a person who is not
      // in the role's serving group is refused.
      parseForm(body, month, roles) {
        const assignments = [];
        for (const role of roles) {
          const dates = role.period === 'monthly' ? [ null ] : logic.sundaysOf(month);
          for (const date of dates) {
            for (let slot = 1; slot <= role.slots; slot++) {
              const sent = body[slotName(role.id, date, slot)];
              const person = typeof sent === 'string' && sent ? sent : null;
              if (person && !role.eligible.includes(person)) {
                throw self.apos.error('invalid', `That person is not in the ${role.name} group.`);
              }
              assignments.push({
                role: role.id,
                date,
                slot,
                person
              });
            }
          }
        }
        return assignments;
      },
      async save(req, month, assignments) {
        const doc = await self.findMonth(req, month) || {
          ...self.newInstance(),
          month,
          title: `Roster ${month}`,
          status: 'draft'
        };
        if (doc.status === 'published') {
          throw self.apos.error('invalid', 'This month is published. Use a swap to change it.');
        }
        doc.assignments = assignments;
        return doc._id ? self.update(req, doc) : self.insert(req, doc);
      },
      // Publishing keeps the roster, marks it published and sends the monthly
      // email to every active adult with an address (the mailer's allowlist
      // decides who really gets it). Returns { sent, refused }.
      async publish(req, month, assignments) {
        const doc = await self.findMonth(req, month);
        if (doc && doc.status === 'published') {
          throw self.apos.error('invalid', 'This month is already published.');
        }
        const saved = await self.save(req, month, assignments);
        saved.status = 'published';
        saved.publishedAt = new Date().toISOString();
        await self.update(req, saved);
        return self.sendMonthly(req, month, assignments);
      },
      // After publishing: the coordinator changes slots and only the people
      // whose slot changed are emailed. Returns { changes, sent, refused }.
      async swap(req, month, assignments) {
        const doc = await self.findMonth(req, month);
        if (!doc || doc.status !== 'published') {
          throw self.apos.error('invalid', 'Only a published month can be swapped.');
        }
        const changes = logic.diffAssignments(doc.assignments || [], assignments);
        if (!changes.length) {
          return {
            changes,
            sent: 0,
            refused: 0
          };
        }
        doc.assignments = assignments;
        await self.update(req, doc);
        const { roles } = await self.rolesAndNames();
        const result = await self.sendSwaps(req, month, roles, changes);
        return {
          changes,
          ...result
        };
      },
      async recipients() {
        const people = await db().find({
          type: 'person',
          email: { $nin: [ '', null ] },
          archived: { $ne: true }
        }).toArray();
        const today = rules.todayIso();
        return people.filter(person => !rules.isInactive(person) && !rules.isMinor(person.dateOfBirth, today));
      },
      t(req, key, data) {
        return self.apos.i18n.i18next.t(key, {
          lng: req.locale,
          interpolation: { escapeValue: false },
          ...data
        });
      },
      async deliver(list) {
        const mailer = self.mailer();
        let sent = 0;
        let refused = 0;
        for (const message of list) {
          const result = await mailer.send(message);
          if (result.sent) {
            sent++;
          } else {
            refused++;
          }
        }
        return {
          sent,
          refused
        };
      },
      async sendMonthly(req, month, assignments) {
        const { roles, names } = await self.rolesAndNames();
        for (const entry of assignments) {
          if (entry.person && !names[entry.person]) {
            const person = await db().findOne({
              type: 'person',
              _id: entry.person
            });
            names[entry.person] = person ? personName(person) : entry.person;
          }
        }
        const layout = logic.layoutRoster({
          month,
          roles,
          assignments,
          names
        });
        const list = logic.layoutText(layout, {
          allMonth: self.t(req, 'church:rosterAllMonth'),
          unfilled: self.t(req, 'church:rosterUnfilled')
        });
        const site = self.apos.modules['church-site'].options.site.name;
        const messages = (await self.recipients()).map(person => {
          const duties = logic.dutiesOf({
            person: person._id,
            roles,
            assignments
          }).map(duty => `${duty.name}: ${duty.date || self.t(req, 'church:rosterAllMonth')}`);
          const mine = duties.length
            ? self.t(req, 'church:rosterEmailMine', { duties: duties.join('\n') })
            : '';
          return {
            to: person.email,
            subject: self.t(req, 'church:rosterEmailSubject', {
              month,
              site
            }),
            text: self.t(req, 'church:rosterEmailBody', {
              month,
              site,
              mine,
              list
            })
          };
        });
        return self.deliver(messages);
      },
      async sendSwaps(req, month, roles, changes) {
        const messages = [];
        const ids = [ ...new Set(changes.flatMap(change => [ change.from, change.to ]).filter(Boolean)) ];
        const people = await db().find({
          type: 'person',
          _id: { $in: ids }
        }).toArray();
        const byId = new Map(people.map(person => [ person._id, person ]));
        for (const change of changes) {
          const role = roles.find(item => item.id === change.role);
          const data = {
            month,
            role: role ? role.name : change.role,
            when: change.date || month
          };
          const note = (person, key) => {
            if (person && person.email) {
              messages.push({
                to: person.email,
                subject: self.t(req, `${key}Subject`, data),
                text: self.t(req, `${key}Body`, {
                  ...data,
                  name: person.preferredName || person.firstName
                })
              });
            }
          };
          note(byId.get(change.from), 'church:rosterSwapOut');
          note(byId.get(change.to), 'church:rosterSwapIn');
        }
        return self.deliver(messages);
      },
      // The "next month's roster" item for the weekly tasks list, in the shape
      // tasks-logic's syncSystemItems takes. There is no tasks module yet; the
      // list calls this when it builds a week.
      async taskConditions(today = rules.todayIso()) {
        const published = await db().find({
          type: self.name,
          status: 'published'
        }).project({ month: 1 }).toArray();
        return logic.rosterConditions({
          today,
          published: published.map(doc => doc.month)
        });
      },
      // The published roster as the bulletin wants it: its role keys, slots
      // from 0, a date on every row (a monthly role is spread over the month's
      // Sundays so two months never mix at a month boundary). Null when
      // neither Sunday's month is published, so the bulletin falls back.
      async bulletinData(req, date) {
        const months = [ ...new Set([ date.slice(0, 7), addDays(date, 7).slice(0, 7) ]) ];
        const docs = await db().find({
          type: self.name,
          status: 'published',
          month: { $in: months }
        }).toArray();
        if (!docs.length) {
          return null;
        }
        const assignments = docs.flatMap(doc => (doc.assignments || []).flatMap(entry => {
          const dates = entry.date ? [ entry.date ] : logic.sundaysOf(doc.month);
          return dates.map(day => ({
            role: entry.role,
            date: day,
            slot: entry.slot - 1,
            person: entry.person
          }));
        }));
        const people = await db().find({
          type: 'person',
          _id: { $in: [ ...new Set(assignments.map(entry => entry.person).filter(Boolean)) ] }
        }).toArray();
        return {
          assignments,
          names: Object.fromEntries(people.map(person => [ person._id, personName(person) ]))
        };
      },
      // What the month page's template needs: one entry per role and date with
      // a choice list per slot.
      page(req, month, state, notice) {
        const { roles } = state;
        const options = Object.fromEntries(roles.map(role => [
          role.id,
          role.eligible.map(id => ({
            id,
            name: state.names[id]
          }))
        ]));
        const published = Boolean(state.doc && state.doc.status === 'published');
        const blocks = roles.map(role => {
          const dates = role.period === 'monthly' ? [ null ] : logic.sundaysOf(month);
          return {
            name: role.name,
            monthly: role.period === 'monthly',
            rows: dates.map(date => ({
              date,
              slots: Array.from({ length: role.slots }, (_, index) => {
                const found = state.assignments.find(entry => entry.role === role.id &&
                  entry.date === date && entry.slot === index + 1);
                const chosen = found ? found.person : null;
                const choices = options[role.id].slice();
                if (chosen && !choices.some(choice => choice.id === chosen)) {
                  choices.push({
                    id: chosen,
                    name: state.names[chosen]
                  });
                }
                return {
                  field: slotName(role.id, date, index + 1),
                  number: index + 1,
                  chosen,
                  choices
                };
              })
            }))
          };
        });
        return {
          month,
          published,
          blocks,
          warnings: state.warnings,
          suggested: !state.doc,
          notice,
          away: state.away.list.map(span => ({
            name: state.names[span.person] || span.person,
            from: span.startDate,
            to: span.endDate
          }))
        };
      },
      adminOnly(req, res) {
        if (!self.apos.permission.isAdmin(req)) {
          res.status(req.user ? 403 : 404).send('Not found');
          return false;
        }
        return true;
      },
      validMonth(req, res) {
        const month = req.params.month;
        if (!MONTH_RE.test(month)) {
          res.status(404).send('Not found');
          return null;
        }
        return month;
      },
      async respond(req, template, data, status = 200) {
        req.res.set('Cache-Control', 'no-store');
        req.res.status(status);
        return self.sendPage(req, template, data);
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
        res.status(status).send(status === 500
          ? 'Something went wrong.'
          : (error.data && error.data.message) || error.message);
      }
    };
    const guarded = fn => safe(async (req, res) => {
      if (!self.adminOnly(req, res)) {
        return;
      }
      const month = self.validMonth(req, res);
      if (!month) {
        return;
      }
      await fn(req, res, month);
    });
    // Parsed from the posted form, against the roles as they are now.
    const submitted = async (req, month) => {
      const { roles } = await self.rolesAndNames();
      return self.parseForm(req.body || {}, month, roles);
    };
    const back = (res, month, result) => {
      const query = result ? `?sent=${result.sent}&refused=${result.refused}` : '';
      res.redirect(`/roster/${month}${query}`);
    };

    return {
      get: {
        '/roster': safe(async (req, res) => {
          if (!self.adminOnly(req, res)) {
            return;
          }
          const today = rules.todayIso();
          let year = Number(today.slice(0, 4));
          let mon = Number(today.slice(5, 7));
          const months = [];
          for (let index = 0; index < 4; index++) {
            months.push(`${year}-${String(mon).padStart(2, '0')}`);
            mon++;
            if (mon > 12) {
              mon = 1;
              year++;
            }
          }
          const docs = await self.apos.doc.db.find({ type: self.name }).toArray();
          for (const doc of docs) {
            if (!months.includes(doc.month)) {
              months.push(doc.month);
            }
          }
          months.sort();
          const due = await self.taskConditions(today);
          return self.respond(req, 'months', {
            months: months.map(month => {
              const doc = docs.find(item => item.month === month);
              return {
                month,
                status: doc ? doc.status : 'none'
              };
            }),
            due: due.map(item => item.month)
          });
        }),
        '/roster/:month': guarded(async (req, res, month) => {
          const state = await self.view(req, month);
          const sent = self.apos.launder.integer(req.query.sent, -1, -1, 100000);
          const refused = self.apos.launder.integer(req.query.refused, 0, 0, 100000);
          return self.respond(req, 'month', self.page(req, month, state, sent >= 0
            ? {
              sent,
              refused
            }
            : null));
        }),
        '/roster/:month/print': guarded(async (req, res, month) => {
          const state = await self.view(req, month);
          const layout = logic.layoutRoster({
            month,
            roles: state.roles,
            assignments: state.assignments,
            names: state.names
          });
          return self.respond(req, 'print', {
            layout,
            published: Boolean(state.doc && state.doc.status === 'published')
          });
        })
      },
      post: {
        '/roster/:month/save': guarded(async (req, res, month) => {
          await self.save(req, month, await submitted(req, month));
          back(res, month);
        }),
        '/roster/:month/publish': guarded(async (req, res, month) => {
          back(res, month, await self.publish(req, month, await submitted(req, month)));
        }),
        '/roster/:month/swap': guarded(async (req, res, month) => {
          back(res, month, await self.swap(req, month, await submitted(req, month)));
        })
      }
    };
  },
  tasks(self) {
    return {
      suggest: {
        usage: 'Print the suggested roster for a month, with its warnings.\n\nnode app roster:suggest --month=2026-12',
        async task(argv) {
          const month = argv.month;
          if (!MONTH_RE.test(month || '')) {
            throw new Error('Give the month: --month=YYYY-MM');
          }
          const state = await self.view(self.apos.task.getReq(), month);
          const layout = logic.layoutRoster({
            month,
            roles: state.roles,
            assignments: state.assignments,
            names: state.names
          });
          // eslint-disable-next-line no-console
          console.log(logic.layoutText(layout));
          for (const warning of state.warnings) {
            // eslint-disable-next-line no-console
            console.log(`! ${warning.message}`);
          }
        }
      }
    };
  }
};
