// Starts the real app modules against a throwaway database. MongoDB is the
// church system's database; the address comes from APOS_MONGODB_URI, as in CI.
const path = require('node:path');
const t = require('apostrophe/test-lib/util.js');

async function start() {
  return t.create({
    // Makes Apostrophe look for our modules/ folder at the repo root.
    root: {
      filename: path.join(__dirname, '..', 'app.js'),
      require
    },
    modules: {
      'church-audit': {},
      person: {},
      household: {},
      'person-relationship': {},
      group: {},
      'office-note': {},
      'away-date': {}
    }
  });
}

async function makeHousehold(apos, req, extra = {}) {
  return apos.household.insert(req, {
    ...apos.household.newInstance(),
    title: 'Placeholder',
    ...extra
  });
}

async function makePerson(apos, req, household, extra = {}) {
  return apos.person.insert(req, {
    ...apos.person.newInstance(),
    firstName: 'Jo',
    lastName: 'Smith',
    dateOfBirth: '1980-05-01',
    householdIds: [ household._id ],
    ...extra
  });
}

async function auditFor(apos, recordId) {
  return apos.churchAudit.collection.find({ recordId }).sort({ at: 1 }).toArray();
}

module.exports = {
  start,
  destroy: t.destroy,
  makeHousehold,
  makePerson,
  auditFor
};
