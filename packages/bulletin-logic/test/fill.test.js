import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysIso, isSunday, longDate, whenText, textToBlocks, fillServing, fillEvents, fillBirthdays
} from '../src/index.js';

test('dates', () => {
  assert.equal(addDaysIso('2026-11-15', 7), '2026-11-22');
  assert.equal(addDaysIso('2026-12-28', 7), '2027-01-04');
  assert.equal(isSunday('2026-11-15'), true);
  assert.equal(isSunday('2026-11-16'), false);
  assert.equal(longDate('2026-11-15'), 'Sunday, November 15, 2026');
  assert.throws(() => longDate('15/11/2026'), /YYYY-MM-DD/);
  assert.throws(() => longDate(undefined), /YYYY-MM-DD/);
});

test('whenText is in Chicago time', () => {
  assert.equal(whenText('2026-11-22T00:30:00Z'), 'Sat, Nov 21 at 6:30 pm');
  assert.equal(whenText('2026-11-22T16:00:00Z'), 'Sun, Nov 22 at 10 am');
});

test('textToBlocks: paragraphs, lists, nothing else', () => {
  assert.deepEqual(textToBlocks(''), []);
  assert.deepEqual(textToBlocks(undefined), []);
  assert.deepEqual(textToBlocks('One\nstill one\n\nTwo'), [
    { type: 'text', text: 'One\nstill one' }, { type: 'text', text: 'Two' }
  ]);
  assert.deepEqual(textToBlocks('Intro\n- a\n* b\nafter\n\n- c'), [
    { type: 'text', text: 'Intro' },
    { type: 'list', items: [ 'a', 'b' ] },
    { type: 'text', text: 'after' },
    { type: 'list', items: [ 'c' ] }
  ]);
  assert.deepEqual(textToBlocks('<b>x</b>'), [ { type: 'text', text: '<b>x</b>' } ]);
});

const roles = [
  { role: 'songLeader', label: 'Song leader', slots: 1 },
  { role: 'greeters', label: 'Greeters', slots: 2 }
];
const names = { a: 'Ann A', b: 'Bob B', c: 'Cy C' };

test('fillServing: this Sunday and next, unfilled shown, nobody invented', () => {
  const assignments = [
    { role: 'songLeader', date: '2026-11-15', slot: 0, person: 'a' },
    { role: 'greeters', date: '2026-11-15', slot: 1, person: 'b' },
    { role: 'greeters', date: '2026-11-22', slot: 0, person: 'c' },
    { role: 'songLeader', date: '2026-11-22', slot: 0, person: null },
    { role: 'songLeader', date: '2026-12-06', slot: 0, person: 'a' }
  ];
  const out = fillServing({ assignments, names, sunday: '2026-11-15', roles });
  assert.equal(out.groups[0].heading, 'Those Serving Today');
  assert.equal(out.groups[1].heading, 'Those to Serve Next Sunday');
  assert.equal(out.groups[1].date, '2026-11-22');
  assert.deepEqual(out.groups[0].rows[0].names, [ 'Ann A' ]);
  assert.deepEqual(out.groups[0].rows[1].names, [ null, 'Bob B' ]);
  assert.deepEqual(out.groups[1].rows[0].names, [ null ]);
  assert.deepEqual(out.groups[1].rows[1].names, [ 'Cy C', null ]);
  assert.equal(out.unfilled, 3);
});

test('fillServing: a monthly role (date null) covers both Sundays; unknown people stay unfilled; default roles', () => {
  const out = fillServing({
    assignments: [ { role: 'songLeader', date: null, slot: 0, person: 'a' }, { role: 'greeters', date: null, slot: 5, person: 'zz' } ],
    names, sunday: '2026-11-15', roles
  });
  assert.deepEqual(out.groups[0].rows[0].names, [ 'Ann A' ]);
  assert.deepEqual(out.groups[1].rows[0].names, [ 'Ann A' ]);
  assert.deepEqual(out.groups[0].rows[1].names, [ null, null ]);
  const dflt = fillServing({ sunday: '2026-11-15' });
  assert.equal(dflt.groups[0].rows.length, 6);
  assert.equal(dflt.unfilled, 2 * (1 + 1 + 1 + 1 + 2 + 4));
});

const ev = (id, startsAt, extra = {}) => ({
  id, title: id, startsAt, announceFrom: '2026-11-01T00:00:00Z', isRegularService: false, status: 'scheduled', ...extra
});

test('fillEvents: public ticked, members-only unticked until the office ticks it', () => {
  const events = [
    ev('potluck', '2026-11-22T17:00:00Z', { location: 'Fellowship hall' }),
    ev('elders', '2026-11-23T00:30:00Z', { visibility: 'members' }),
    ev('cancelled', '2026-11-24T00:30:00Z', { status: 'cancelled' }),
    ev('changed', '2026-11-25T00:30:00Z', { status: 'changed' }),
    ev('unticked-by-event', '2026-11-26T00:30:00Z', { inBulletin: false }),
    ev('far', '2027-01-01T00:30:00Z'),
    ev('regular', '2026-11-22T16:00:00Z', { isRegularService: true })
  ];
  const one = fillEvents({ events, printDate: '2026-11-15' });
  const ids = list => list.map(e => e.id);
  assert.deepEqual(ids(one.candidates), [ 'potluck', 'elders', 'cancelled', 'changed', 'unticked-by-event' ]);
  assert.deepEqual(ids(one.included), [ 'potluck', 'cancelled', 'changed' ]);
  assert.equal(one.candidates[0].location, 'Fellowship hall');
  assert.equal(one.candidates[2].statusLabel, 'CANCELLED');
  assert.equal(one.candidates[3].statusLabel, 'CHANGED');
  assert.equal(one.candidates[0].statusLabel, '');
  assert.equal(one.candidates[1].memberOnly, true);
  assert.equal(one.candidates[1].location, '');

  const two = fillEvents({
    events,
    printDate: '2026-11-15',
    choices: {
      elders: { membersOk: true },
      potluck: { include: false },
      'unticked-by-event': { include: true }
    }
  });
  assert.deepEqual(ids(two.included), [ 'elders', 'cancelled', 'changed', 'unticked-by-event' ]);
  // Ticking "members OK" and then unticking it again keeps it out.
  const three = fillEvents({ events, printDate: '2026-11-15', choices: { elders: { membersOk: true, include: false } } });
  assert.ok(!ids(three.included).includes('elders'));
  assert.deepEqual(fillEvents({ printDate: '2026-11-15' }).included, []);
});

const person = (id, name, dateOfBirth, extra = {}) => ({ id, name, dateOfBirth, ...extra });

test('fillBirthdays: adults only, with the leak cases', () => {
  const people = [
    person('adult', 'Ann Adult', '1980-11-17'),
    person('minor', 'Kid Minor', '2015-11-17'),
    person('turns18', 'Tess Teen', '2008-11-17'),
    person('dead', 'Dan Dead', '1950-11-17', { inactiveReason: 'deceased' }),
    person('hidden', 'Hal Hidden', '1970-11-18', { hiddenFields: [ 'birthday' ] }),
    person('nodob', 'No Dob', ''),
    person('other-week', 'Ola Later', '1970-12-30'),
    person('a1', 'Gil Groom', '1975-03-01', { hiddenFields: [ 'email' ] }),
    person('a2', 'Bea Bride', '1976-03-01'),
    person('w1', 'Walt Widower', '1960-03-19'),
    person('w2', 'Wendy Wife', '1961-03-19', { inactiveReason: 'deceased' }),
    person('h1', 'Hugh Hide', '1960-03-20', { hiddenFields: [ 'anniversary' ] }),
    person('h2', 'Hana Hide', '1961-03-20'),
    person('m1', 'Mia Minor', '2012-03-21'),
    person('m2', 'Max Adult', '1970-03-21'),
    person('d1', 'Dee Dead', '1960-03-22'),
    person('d2', 'Del Dead', '1961-03-22')
  ];
  const relationships = [
    { personA: 'a1', personB: 'a2', anniversary: '2001-11-16' },
    { personA: 'w1', personB: 'w2', anniversary: '1990-11-19' },
    { personA: 'h1', personB: 'h2', anniversary: '1990-11-20' },
    { personA: 'm1', personB: 'm2', anniversary: '1990-11-21' },
    { personA: 'd1', personB: 'd2', anniversary: '1990-11-22', deceased: true },
    { personA: 'ghost', personB: 'a2', anniversary: '1990-11-17' },
    { personA: 'a1', personB: 'a2', anniversary: '' }
  ];
  const items = fillBirthdays({ people, relationships, from: '2026-11-15' });
  const texts = items.map(i => i.text);
  assert.deepEqual(texts, [ 'Gil Groom & Bea Bride', 'Ann Adult', 'Tess Teen' ]);
  assert.deepEqual(items.map(i => i.kind), [ 'anniversary', 'birthday', 'birthday' ]);
  const everything = JSON.stringify(items);
  for (const leak of [ 'Kid', 'Dan', 'Hal', 'Walt', 'Wendy', 'Hugh', 'Hana', 'Mia', 'Dee', 'Del', 'Ola', 'No Dob' ]) {
    assert.ok(!everything.includes(leak), `${leak} leaked`);
  }
  assert.ok(items.every(i => /^2026-11-\d\d$/.test(i.date)));
});

test('fillBirthdays: 18th birthday this week counts; the day before does not; 29 Feb', () => {
  const people = [
    person('t', 'Tess', '2008-11-15'),
    person('u', 'Uma', '2008-11-16'),
    person('l', 'Leap', '1996-02-29'),
    person('m', 'Leapa', '1996-02-29')
  ];
  assert.deepEqual(fillBirthdays({ people, from: '2026-11-15' }).map(i => i.text), [ 'Tess', 'Uma' ]);
  assert.deepEqual(fillBirthdays({ people, from: '2027-02-25' }).map(i => i.text), [ 'Leap', 'Leapa' ]);
  assert.deepEqual(fillBirthdays({ people, from: '2028-02-25' }).map(i => i.date), [ '2028-02-29', '2028-02-29' ]);
  assert.deepEqual(fillBirthdays({ from: '2026-11-15' }), []);
});
