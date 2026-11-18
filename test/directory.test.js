// The directory logic, with no database: built on the demo households.
const test = require('node:test');
const assert = require('node:assert/strict');
const directory = require('../lib/directory.js');
const demo = require('../lib/demo-data.js');
const { renderPdf } = require('../lib/directory-pdf.js');

const TODAY = '2026-11-17';

// The demo plan as the records the module reads, with made-up ids.
function snapshot() {
  const plan = demo.plan(TODAY);
  const ids = new Map();
  const households = [];
  const people = [];
  for (const entry of plan.households) {
    const household = {
      _id: `h-${entry.key}`,
      title: entry.people[0].lastName,
      address: entry.address,
      homePhone: entry.homePhone,
      directoryOptOut: Boolean(entry.directoryOptOut)
    };
    households.push(household);
    for (const { key, ...fields } of entry.people) {
      ids.set(key, `p-${key}`);
      people.push({
        _id: `p-${key}`,
        status: 'member',
        title: `${fields.firstName} ${fields.lastName}`,
        ...fields,
        householdIds: [ household._id ]
      });
    }
  }
  return {
    households,
    people,
    relationships: plan.relationships.map((link, n) => ({
      _id: `r-${n}`,
      kind: link.kind,
      personAIds: [ ids.get(link.a) ],
      personBIds: [ ids.get(link.b) ],
      anniversary: link.anniversary || null
    })),
    groups: plan.groups.map((group, n) => ({
      _id: `g-${n}`,
      title: group.title,
      membersIds: group.members.map(key => ids.get(key))
    }))
  };
}

const member = {
  role: 'guest',
  householdId: 'h-placeholder',
  isAdult: true
};
const office = {
  role: 'admin',
  householdId: 'h-demo',
  isAdult: true
};

const rowsFor = (viewer, extra = {}) => directory.directoryRows({
  viewer,
  snapshot: snapshot(),
  today: TODAY,
  ...extra
});

test('members see households A to Z, without opt-outs, visitors or inactive people', () => {
  const names = rowsFor(member).map(row => row.name);
  assert.deepEqual(names, [ ...names ].sort((a, b) => a.localeCompare(b)));
  assert.ok(names.includes('Sample'));
  assert.ok(!names.includes('Quill'), 'opted out');
  assert.ok(!names.includes('Mock'), 'visitor only');
  assert.ok(!names.includes('Away'), 'moved away');
});

test('the office can add the hidden households back, flagged', () => {
  const rows = rowsFor(office, {
    include: {
      inactive: true,
      visitors: true,
      optedOut: true
    }
  });
  const quill = rows.find(row => row.name === 'Quill');
  assert.ok(quill && quill.flags.includes('optedOut'));
  assert.ok(rows.find(row => row.name === 'Mock').flags.includes('visitor'));
  assert.ok(rows.find(row => row.name === 'Away').flags.includes('inactive'));
});

test('search ignores case and accents, and finds by street and phone', () => {
  assert.deepEqual(rowsFor(member, { query: 'SAMPLE' }).map(row => row.name), [ 'Sample' ]);
  assert.deepEqual(rowsFor(member, { query: 'sal' }).map(row => row.name), [ 'Sample' ]);
  assert.ok(rowsFor(member, { query: 'Sample St' }).some(row => row.name === 'Sample'));
  assert.ok(!rowsFor(member, { query: 'Example Ln' }).some(row => row.name === 'Example'), 'a hidden address is not searchable');
  assert.ok(rowsFor(member, { query: '555-0142' }).some(row => row.name === 'Example'));
  assert.equal(rowsFor(member, { query: 'zzzz' }).length, 0);
});

test('a hidden address stays out of the row for other members', () => {
  const row = rowsFor(member).find(entry => entry.name === 'Example');
  assert.ok(!JSON.stringify(row).includes('18 Example'));
});

test('the household page shows a child as name and birthday only', () => {
  const view = directory.householdView({
    viewer: member,
    household: snapshot().households.find(h => h._id === 'h-sample'),
    snapshot: snapshot(),
    today: TODAY
  });
  const sasha = view.people.find(person => person.name.startsWith('Sasha'));
  assert.ok(sasha.minor);
  assert.ok(sasha.birthday);
  assert.ok(!sasha.cellphone);
  assert.ok(!sasha.email);
  assert.equal(view.canEdit, false);
});

test('a member can edit their own household; sally\'s hidden cellphone shows to her own household only', () => {
  const sam = {
    role: 'guest',
    householdId: 'h-sample',
    isAdult: true
  };
  const household = snapshot().households.find(h => h._id === 'h-sample');
  const own = directory.householdView({
    viewer: sam,
    household,
    snapshot: snapshot(),
    today: TODAY
  });
  assert.equal(own.canEdit, true);
  const other = directory.householdView({
    viewer: member,
    household,
    snapshot: snapshot(),
    today: TODAY
  });
  assert.ok(!JSON.stringify(other).includes('555-0102'));
});

test('an opted-out household is not open to other members', () => {
  const view = directory.householdView({
    viewer: member,
    household: snapshot().households.find(h => h._id === 'h-quill'),
    snapshot: snapshot(),
    today: TODAY
  });
  assert.equal(view, null);
});

test('PDF entries leave out hidden fields, opt-outs, visitors, the inactive and minors\' contacts', () => {
  const entries = directory.pdfEntries({
    snapshot: snapshot(),
    today: TODAY
  });
  const text = JSON.stringify(entries);
  for (const secret of [ '555-0102', 'Quill', 'Mock', 'Avery', 'Dana', '18 Example Ln', '555-0103', 'fran.figure' ]) {
    assert.ok(!text.includes(secret), `${secret} must not be in the PDF`);
  }
  const names = entries.map(entry => entry.surname);
  assert.deepEqual(names, [ ...names ].sort((a, b) => a.localeCompare(b)));
  assert.ok(text.includes('Sasha'));
});

test('the PDF can leave adults\' birthdays out', () => {
  const entries = directory.pdfEntries({
    snapshot: snapshot(),
    adultBirthdays: false,
    today: TODAY
  });
  assert.ok(entries.every(entry => entry.adults.every(adult => !adult.birthday)));
});

test('the PDF renders as a PDF', async () => {
  const entries = directory.pdfEntries({
    snapshot: snapshot(),
    today: TODAY
  });
  const buffer = await renderPdf({
    entries,
    compress: false,
    birthday: value => value,
    labels: {
      title: 'Test directory',
      subtitle: 'November 2026',
      footerLeft: 'Members only',
      footerRight: 'Page',
      home: phone => `Home ${phone}`,
      married: date => `Married ${date}`,
      children: names => `Children: ${names}`,
      born: date => `b. ${date}`
    }
  });
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  // Page text is font-encoded, so the content is checked by the browser test.
  assert.ok(buffer.length > 1000);
});

const form = (extra = {}) => ({
  street: '1 A St',
  city: 'Town',
  state: 'TX',
  zip: '78945',
  homePhone: '',
  'p.p-sam.firstName': 'Sam',
  'p.p-sam.lastName': 'Sample',
  'p.p-sam.dateOfBirth': '1980-03-14',
  'p.p-sam.email': 'sam.sample@example.com',
  'p.p-sam.cellphone': '',
  ...extra
});
const sam = () => snapshot().people.filter(person => person._id === 'p-sam');

test('the edit form reports what is wrong, per field', () => {
  const patch = directory.parseHouseholdEdit({
    body: form({
      'p.p-sam.firstName': '',
      'p.p-sam.dateOfBirth': 'not a date',
      'p.p-sam.email': 'nope'
    }),
    household: {},
    people: sam(),
    office: false,
    today: TODAY
  });
  assert.deepEqual(patch.errors.map(error => error.key).sort(),
    [ 'errorDateOfBirth', 'errorEmail', 'errorFirstNameRequired' ]);
});

test('members cannot set the office-only fields', () => {
  const patch = directory.parseHouseholdEdit({
    body: form({
      title: 'Hacked',
      'p.p-sam.status': 'visitor',
      'p.p-sam.inactiveReason': 'moved'
    }),
    household: {},
    people: sam(),
    office: false,
    today: TODAY
  });
  assert.equal(patch.errors.length, 0);
  assert.equal(patch.household.title, undefined);
  assert.equal(patch.people[0].set.status, undefined);
  assert.equal(patch.people[0].set.inactiveReason, undefined);
});

test('the office can set the name, status and inactive reason', () => {
  const patch = directory.parseHouseholdEdit({
    body: form({
      title: 'Sample, Sam',
      'p.p-sam.status': 'regular',
      'p.p-sam.inactiveReason': 'left'
    }),
    household: {},
    people: sam(),
    office: true,
    today: TODAY
  });
  assert.equal(patch.household.title, 'Sample, Sam');
  assert.equal(patch.people[0].set.status, 'regular');
  assert.equal(patch.people[0].set.inactiveReason, 'left');
});

test('changedFields returns only what changed', () => {
  assert.deepEqual(directory.changedFields({
    a: 'x',
    b: 'y'
  }, {
    a: 'x',
    b: 'z',
    c: ''
  }), { b: 'z' });
});

test('changedFields treats a stored null like an empty value', () => {
  assert.deepEqual(directory.changedFields({
    hiddenFields: null,
    email: null
  }, {
    hiddenFields: [],
    email: ''
  }), {});
});
