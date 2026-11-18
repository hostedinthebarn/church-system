// A span of dates when a person can't serve. Marked by them (as part of
// editing their household) or by the office; seen only by the office and the
// roster coordinator.
//
// Marking them (LGC-44), at /away: a signed-in adult sees their own household's
// upcoming away dates and adds or removes them; the office picks any household.
// A member sees only their own household's dates, never anyone else's.
const rules = require('../../lib/rules.js');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

module.exports = {
  extend: '@apostrophecms/piece-type',
  options: {
    alias: 'awayDate',
    label: 'Away date',
    pluralLabel: 'Away dates',
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
        label: 'Summary',
        readOnly: true
      },
      _person: {
        type: 'relationship',
        label: 'Person',
        withType: 'person',
        max: 1,
        required: true
      },
      startDate: {
        type: 'date',
        label: 'From',
        required: true
      },
      endDate: {
        type: 'date',
        label: 'To',
        help: 'Leave blank for a single day.'
      }
    }
  },
  handlers(self) {
    // Title and checks run before Apostrophe makes the slug from the title.
    const check = (req, doc) => {
      doc.endDate = doc.endDate || doc.startDate;
      if (doc.endDate < doc.startDate) {
        throw self.apos.error('invalid', 'The last day can\'t be before the first.', {
          field: 'endDate'
        });
      }
      doc.title = doc.startDate === doc.endDate
        ? doc.startDate
        : `${doc.startDate} to ${doc.endDate}`;
    };
    return {
      beforeInsert: { check },
      beforeUpdate: { check }
    };
  },
  methods(self) {
    const db = () => self.apos.doc.db;
    return {
      // Who is asking, as rules.canEditHousehold wants it.
      async viewer(req) {
        if (!req.user) {
          return null;
        }
        const viewer = { role: req.user.role };
        const person = req.user.personId
          ? await db().findOne({
            type: 'person',
            _id: req.user.personId,
            archived: { $ne: true }
          })
          : null;
        if (person) {
          viewer.householdId = (person.householdIds || [])[0];
          viewer.isAdult = !rules.isMinor(person.dateOfBirth, rules.todayIso());
        }
        return viewer;
      },
      // The request that writes the record: the permission check was ours, so
      // it acts as an admin, but keeps the real user for the audit trail.
      actingReq(req) {
        const acting = self.apos.task.getReq();
        acting.user = {
          ...req.user,
          role: 'admin'
        };
        return acting;
      },
      async upcoming(householdId) {
        const people = await self.apos.household.peopleIn(householdId);
        const ids = people.map(person => person._id);
        const spans = await db().find({
          type: self.name,
          personIds: { $in: ids },
          endDate: { $gte: rules.todayIso() }
        }).sort({ startDate: 1 }).toArray();
        const byId = new Map(people.map(person => [ person._id, person ]));
        return {
          people,
          spans: spans.map(span => ({
            id: span._id,
            name: byId.get((span.personIds || [])[0]).firstName,
            from: span.startDate,
            to: span.endDate
          }))
        };
      },
      async add(req, householdId, {
        person, startDate, endDate
      }) {
        if (!householdId) {
          throw self.apos.error('invalid', 'Choose a household first.');
        }
        const { people } = await self.upcoming(householdId);
        if (!people.some(item => item._id === person)) {
          throw self.apos.error('invalid', 'That person is not in this household.');
        }
        if (!DATE_RE.test(startDate || '') || (endDate && !DATE_RE.test(endDate))) {
          throw self.apos.error('invalid', 'Give the dates as YYYY-MM-DD.');
        }
        return self.insert(self.actingReq(req), {
          ...self.newInstance(),
          personIds: [ person ],
          startDate,
          endDate: endDate || startDate
        });
      },
      async remove(req, householdId, id) {
        if (!householdId) {
          throw self.apos.error('invalid', 'Choose a household first.');
        }
        const { people } = await self.upcoming(householdId);
        const span = await db().findOne({
          type: self.name,
          _id: id
        });
        if (!span || !people.some(item => item._id === (span.personIds || [])[0])) {
          throw self.apos.error('notfound', 'No such away date in this household.');
        }
        await self.delete(self.actingReq(req), span);
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
    // Resolves who may edit which household. Signed-out visitors and people
    // without a household get a plain 404; a household that is not theirs, 403.
    const allowed = fn => safe(async (req, res) => {
      const viewer = await self.viewer(req);
      if (!viewer) {
        return res.status(404).send('Not found');
      }
      const asked = self.apos.launder.id((req.body && req.body.household) || req.query.household);
      const householdId = rules.isOffice(viewer) ? asked : viewer.householdId;
      if (!householdId && !rules.isOffice(viewer)) {
        return res.status(404).send('Not found');
      }
      if (householdId && !rules.canEditHousehold(viewer, householdId)) {
        return res.status(403).send('Not allowed');
      }
      return fn(req, res, viewer, householdId);
    });
    const page = async (req, res, template, data) => {
      res.set('Cache-Control', 'no-store');
      return self.sendPage(req, template, data);
    };
    const back = (res, viewer, householdId) => res.redirect(rules.isOffice(viewer)
      ? `/away?household=${householdId}`
      : '/away');

    return {
      get: {
        '/away': allowed(async (req, res, viewer, householdId) => {
          if (!householdId) {
            const households = await self.apos.doc.db.find({ type: 'household' })
              .sort({ title: 1 }).toArray();
            return page(req, res, 'away', {
              households: households.map(item => ({
                id: item._id,
                title: item.title
              }))
            });
          }
          const household = await self.apos.doc.db.findOne({
            type: 'household',
            _id: householdId
          });
          if (!household) {
            return res.status(404).send('Not found');
          }
          const { people, spans } = await self.upcoming(householdId);
          return page(req, res, 'away', {
            household: {
              id: householdId,
              title: household.title
            },
            office: rules.isOffice(viewer),
            people: people.map(person => ({
              id: person._id,
              name: person.preferredName || person.firstName
            })),
            spans,
            today: rules.todayIso()
          });
        })
      },
      post: {
        '/away/add': allowed(async (req, res, viewer, householdId) => {
          await self.add(req, householdId, {
            person: self.apos.launder.id(req.body.person),
            startDate: self.apos.launder.string(req.body.startDate),
            endDate: self.apos.launder.string(req.body.endDate)
          });
          back(res, viewer, householdId);
        }),
        '/away/remove': allowed(async (req, res, viewer, householdId) => {
          await self.remove(req, householdId, self.apos.launder.id(req.body.id));
          back(res, viewer, householdId);
        })
      }
    };
  }
};
