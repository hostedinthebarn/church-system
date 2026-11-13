const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../lib/rules.js');

const TODAY = '2026-11-13';
const adult = (firstName, lastName, extra = {}) => ({
  firstName,
  lastName,
  dateOfBirth: '1980-05-01',
  ...extra
});
const kid = (firstName, lastName) => ({
  firstName,
  lastName,
  dateOfBirth: '2015-12-01'
});

test('minor is worked out from the date of birth', () => {
  assert.equal(rules.ageOn('2008-11-13', TODAY), 18);
  assert.equal(rules.ageOn('2008-11-14', TODAY), 17);
  assert.equal(rules.isMinor('2008-11-14', TODAY), true);
  assert.equal(rules.isMinor('2008-11-13', TODAY), false);
  assert.equal(rules.ageOn('', TODAY), null);
  // Without a date of birth we take the safe side.
  assert.equal(rules.isMinor(undefined, TODAY), true);
});

test('the "now an adult" prompt lists people who turned 18 between two dates', () => {
  const people = [
    {
      firstName: 'A',
      dateOfBirth: '2008-11-10'
    },
    {
      firstName: 'B',
      dateOfBirth: '2008-11-20'
    },
    {
      firstName: 'C',
      dateOfBirth: '1990-01-01'
    }
  ];
  assert.deepEqual(rules.becameAdult(people, '2026-11-01', TODAY).map(p => p.firstName), [ 'A' ]);
});

test('household names follow the directory style', () => {
  assert.equal(rules.householdName([ adult('Gary', 'Bailey'), adult('Shannon', 'Bailey'), kid('Sam', 'Bailey') ], TODAY), 'Bailey, Gary & Shannon');
  assert.equal(rules.householdName([ adult('Jo', 'Smith'), adult('Lee', 'Jones') ], TODAY), 'Smith, Jo & Lee Jones');
  assert.equal(rules.householdName([ adult('Ann', 'Lee'), adult('Bo', 'Lee'), adult('Cy', 'Lee') ], TODAY), 'Lee, Ann, Bo & Cy');
  assert.equal(rules.householdName([ adult('Robert', 'Fox', { preferredName: 'Bob' }) ], TODAY), 'Fox, Bob');
});

test('a household with no adults, or nobody listed, is still named sensibly', () => {
  assert.equal(rules.householdName([ kid('Tess', 'Ward') ], TODAY), 'Ward, Tess');
  assert.equal(rules.householdName([], TODAY), '');
  assert.equal(rules.householdName([ adult('Al', 'Gone', { inactiveReason: 'moved' }) ], TODAY), '');
  assert.match(rules.householdName([ adult('Al', 'Park') ]), /^Park, Al$/);
});

test('diffFields reports old and new values and skips ignored fields', () => {
  const changes = rules.diffFields(
    {
      a: 1,
      b: 'x',
      c: [ 1 ],
      updatedAt: 1
    },
    {
      a: 2,
      b: 'x',
      c: [ 1, 2 ],
      d: 'new',
      updatedAt: 2
    },
    rules.BOOKKEEPING
  );
  assert.deepEqual(changes, [
    {
      field: 'a',
      old: 1,
      new: 2
    },
    {
      field: 'c',
      old: [ 1 ],
      new: [ 1, 2 ]
    },
    {
      field: 'd',
      old: null,
      new: 'new'
    }
  ]);
  assert.deepEqual(rules.diffFields(null, { a: 1 }), [ {
    field: 'a',
    old: null,
    new: 1
  } ]);
  assert.deepEqual(rules.diffFields({ a: 1 }, null), [ {
    field: 'a',
    old: 1,
    new: null
  } ]);
});

test('a forget request redacts values but keeps who, when and which field', () => {
  const entry = {
    recordId: 'p1',
    at: 'now',
    changes: [ {
      field: 'email',
      old: 'a@b.c',
      new: null
    }, {
      field: 'x',
      old: null,
      new: 'y'
    } ]
  };
  assert.deepEqual(rules.redactEntry(entry), {
    recordId: 'p1',
    at: 'now',
    changes: [
      {
        field: 'email',
        old: rules.FORGOTTEN,
        new: null
      },
      {
        field: 'x',
        old: null,
        new: rules.FORGOTTEN
      }
    ],
    redacted: true
  });
  assert.deepEqual(rules.redactEntry({ recordId: 'p2' }).changes, []);
});

test('an office note can only be struck through, never edited', () => {
  const note = {
    text: 'Called',
    struck: false,
    updatedAt: 1
  };
  assert.equal(rules.noteChangeAllowed(note, {
    ...note,
    struck: true,
    updatedAt: 2
  }), true);
  assert.equal(rules.noteChangeAllowed(note, {
    ...note,
    text: 'Called twice'
  }), false);
  assert.equal(rules.noteChangeAllowed(note, {
    ...note,
    contacted: true
  }), false);
});

test('days since the last contact ignore struck notes and plain notes', () => {
  const notes = [
    {
      contacted: true,
      contactDate: '2026-10-01'
    },
    {
      contacted: true,
      contactDate: '2026-11-03'
    },
    {
      contacted: true,
      contactDate: '2026-11-10',
      struck: true
    },
    {
      contacted: false,
      contactDate: '2026-11-12'
    }
  ];
  assert.equal(rules.daysSinceContact(notes, TODAY), 10);
  assert.equal(rules.daysSinceContact([ { contacted: false } ], TODAY), null);
  assert.equal(rules.daysSinceContact([], TODAY), null);
  assert.equal(rules.daysSinceContact([ {
    contacted: true,
    contactDate: '2027-01-01'
  } ], TODAY), 0);
});

test('members edit only their own household, and only as adults; the office edits any', () => {
  const office = { role: 'admin' };
  const adultMember = {
    role: 'guest',
    householdId: 'h1',
    isAdult: true
  };
  assert.equal(rules.canEditHousehold(office, 'h9'), true);
  assert.equal(rules.canEditHousehold(adultMember, 'h1'), true);
  assert.equal(rules.canEditHousehold(adultMember, 'h2'), false);
  assert.equal(rules.canEditHousehold({
    ...adultMember,
    isAdult: false
  }, 'h1'), false);
  assert.equal(rules.canEditHousehold(adultMember, undefined), false);
  assert.equal(rules.canEditHousehold(null, 'h1'), false);
});

const household = {
  _id: 'h1',
  address: { street: '1 Main' },
  directoryOptOut: false
};
const person = {
  firstName: 'Jo',
  lastName: 'Smith',
  dateOfBirth: '1980-05-01',
  email: 'jo@example.com',
  cellphone: '555-0100',
  status: 'member',
  hiddenFields: [],
  baptismDate: '1995-06-01',
  showBaptism: false
};
const other = {
  role: 'guest',
  householdId: 'h2',
  isAdult: true
};

test('the office sees everything, including status and the full date of birth', () => {
  const view = rules.viewPerson({
    viewer: { role: 'admin' },
    person,
    household,
    today: TODAY
  });
  assert.equal(view.status, 'member');
  assert.equal(view.dateOfBirth, '1980-05-01');
});

test('another household sees contact details unless hidden, and never status or birth year', () => {
  const view = rules.viewPerson({
    viewer: other,
    person,
    household,
    today: TODAY
  });
  assert.equal(view.email, 'jo@example.com');
  assert.equal(view.cellphone, '555-0100');
  assert.deepEqual(view.address, { street: '1 Main' });
  assert.equal(view.birthday, '05-01');
  assert.equal(view.status, undefined);
  assert.equal(view.dateOfBirth, undefined);
  assert.equal(view.baptismDate, undefined);

  const hidden = rules.viewPerson({
    viewer: other,
    person: {
      ...person,
      hiddenFields: [ 'email', 'cellphone', 'address' ],
      showBaptism: true
    },
    household,
    today: TODAY
  });
  assert.equal(hidden.email, undefined);
  assert.equal(hidden.cellphone, undefined);
  assert.equal(hidden.address, undefined);
  assert.equal(hidden.baptismDate, '1995-06-01');
});

test('a minor shows to other members by name and birthday only', () => {
  const view = rules.viewPerson({
    viewer: other,
    person: {
      ...person,
      dateOfBirth: '2015-12-01'
    },
    household,
    today: TODAY
  });
  assert.equal(view.minor, true);
  assert.equal(view.birthday, '12-01');
  assert.equal(view.email, undefined);
  assert.equal(view.cellphone, undefined);
  assert.equal(view.address, undefined);
});

test('inactive people, visitors and opted-out households are not listed to other members', () => {
  const look = (p, h = household) => rules.viewPerson({
    viewer: other,
    person: p,
    household: h,
    today: TODAY
  });
  assert.equal(look({
    ...person,
    inactiveReason: 'moved'
  }), null);
  assert.equal(look({
    ...person,
    status: 'visitor'
  }), null);
  assert.equal(look(person, {
    ...household,
    directoryOptOut: true
  }), null);
  assert.equal(rules.viewPerson({
    viewer: null,
    person,
    household,
    today: TODAY
  }), null);
});

test('your own household sees the whole record except the office-only fields', () => {
  const own = {
    role: 'guest',
    householdId: 'h1',
    isAdult: true
  };
  const view = rules.viewPerson({
    viewer: own,
    person: {
      ...person,
      hiddenFields: [ 'email' ],
      inactiveReason: 'deceased'
    },
    household,
    today: TODAY
  });
  assert.equal(view.email, 'jo@example.com');
  assert.equal(view.status, undefined);
  assert.equal(view.inactiveReason, undefined);
  assert.equal(view.dateOfBirth, undefined);
  // A death takes the birthday off the page.
  assert.equal(view.birthday, null);
});

test('a missing date of birth gives no birthday', () => {
  assert.equal(rules.birthday(undefined), null);
});

test('a relationship is marked deceased when either person has died', () => {
  assert.equal(rules.relationshipDeceased([ { inactiveReason: 'deceased' }, {} ]), true);
  assert.equal(rules.relationshipDeceased([ { inactiveReason: 'moved' }, null ]), false);
});

test('inactive and today helpers', () => {
  assert.equal(rules.isInactive({ inactiveReason: 'left' }), true);
  assert.equal(rules.isInactive({ inactiveReason: '' }), false);
  assert.equal(rules.todayIso(new Date('2026-11-13T23:00:00Z')), '2026-11-13');
});

test('storedFields drops temporary relationship copies and relationship extras', () => {
  assert.deepEqual(
    rules.storedFields({
      _id: 'a',
      _household: [ {} ],
      householdIds: [ 'h' ],
      householdFields: {},
      name: 'x'
    }),
    {
      _id: 'a',
      householdIds: [ 'h' ],
      name: 'x'
    }
  );
  assert.equal(rules.storedFields(null), null);
});
