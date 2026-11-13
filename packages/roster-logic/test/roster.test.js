import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestRoster, sundaysOf } from '../src/index.js';

// Placeholder people only.
const SONG = ['Alder', 'Birch', 'Cedar', 'Dogwood'];
const GREETERS = Array.from({ length: 20 }, (_, i) => `Greeter${String(i + 1).padStart(2, '0')}`);

const songLeaders = { id: 'song', name: 'Song leader', slots: 1, period: 'weekly', eligible: SONG };
const greeters = { id: 'greet', name: 'Greeter', slots: 2, period: 'weekly', eligible: GREETERS };

const who = (res, role, date) =>
  res.assignments.filter((a) => a.role === role && a.date === date).map((a) => a.person);

// December 2026 Sundays: 6, 13, 20, 27.
const DEC = ['2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27'];

test('sundaysOf lists the Sundays of a month', () => {
  assert.deepEqual(sundaysOf('2026-12'), DEC);
  assert.deepEqual(sundaysOf('2026-11'), ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
});

test('sundaysOf and suggestRoster reject a bad month', () => {
  assert.throws(() => sundaysOf('2026-13'), RangeError);
  assert.throws(() => sundaysOf('Dec 2026'), RangeError);
  assert.throws(() => suggestRoster({ month: 'x', roles: [] }), RangeError);
});

test('rejects bad slots and period', () => {
  assert.throws(() => suggestRoster({ month: '2026-12', roles: [{ ...songLeaders, slots: -1 }] }), /slots/);
  assert.throws(() => suggestRoster({ month: '2026-12', roles: [{ ...songLeaders, slots: 1.5 }] }), /slots/);
  assert.throws(() => suggestRoster({ month: '2026-12', roles: [{ ...songLeaders, period: 'daily' }] }), /period/);
});

test('no history: fixed tie order, rotates through the pool', () => {
  const res = suggestRoster({ month: '2026-12', roles: [songLeaders] });
  assert.deepEqual(DEC.map((d) => who(res, 'song', d)[0]), ['Alder', 'Birch', 'Cedar', 'Dogwood']);
  assert.deepEqual(res.warnings, []);
});

test('is deterministic', () => {
  const input = { month: '2026-12', roles: [songLeaders, greeters] };
  assert.deepEqual(suggestRoster(input), suggestRoster(input));
});

test('longest since last served goes first, never-served before anyone', () => {
  const history = [
    { role: 'song', person: 'Alder', date: '2026-11-29' },
    { role: 'song', person: 'Birch', date: '2026-11-22' },
    { role: 'song', person: 'Cedar', date: '2026-11-15' },
  ];
  const res = suggestRoster({ month: '2026-12', roles: [songLeaders], history });
  assert.deepEqual(DEC.map((d) => who(res, 'song', d)[0]), ['Dogwood', 'Cedar', 'Birch', 'Alder']);
});

test('only the latest date per person counts, whatever the history order', () => {
  const history = [
    { role: 'song', person: 'Alder', date: '2026-11-29' },
    { role: 'song', person: 'Alder', date: '2026-01-04' },
    { role: 'song', person: 'Birch', date: '2026-11-01' },
    { role: 'song', person: 'Cedar', date: '2026-11-08' },
    { role: 'song', person: 'Dogwood', date: '2026-11-15' },
  ];
  const res = suggestRoster({ month: '2026-12', roles: [songLeaders], history });
  assert.deepEqual(DEC.map((d) => who(res, 'song', d)[0]), ['Birch', 'Cedar', 'Dogwood', 'Alder']);
});

test('history in another role does not count', () => {
  const history = [{ role: 'greet', person: 'Alder', date: '2026-11-29' }];
  const res = suggestRoster({ month: '2026-12', roles: [songLeaders], history });
  assert.equal(who(res, 'song', DEC[0])[0], 'Alder');
});

test('tie on the same last date falls back to eligible order', () => {
  const history = [
    { role: 'song', person: 'Cedar', date: '2026-11-29' },
    { role: 'song', person: 'Birch', date: '2026-11-29' },
  ];
  const res = suggestRoster({ month: '2026-12', roles: [songLeaders], history });
  assert.deepEqual(DEC.map((d) => who(res, 'song', d)[0]), ['Alder', 'Dogwood', 'Birch', 'Cedar']);
});

test('weekly away is skipped on that date only', () => {
  const away = [{ person: 'Alder', date: DEC[0] }];
  const res = suggestRoster({ month: '2026-12', roles: [songLeaders], away });
  assert.deepEqual(DEC.map((d) => who(res, 'song', d)[0]), ['Birch', 'Alder', 'Cedar', 'Dogwood']);
});

test('away on other dates does not matter', () => {
  const away = [{ person: 'Alder', date: '2026-11-29' }, { person: 'Alder', date: '2027-01-03' }];
  const res = suggestRoster({ month: '2026-12', roles: [songLeaders], away });
  assert.equal(who(res, 'song', DEC[0])[0], 'Alder');
});

test('multi-slot roles: no one twice on one date, realistic greeter pool', () => {
  const res = suggestRoster({ month: '2026-12', roles: [greeters] });
  assert.deepEqual(res.warnings, []);
  for (const d of DEC) {
    const people = who(res, 'greet', d);
    assert.equal(people.length, 2);
    assert.equal(new Set(people).size, 2);
  }
  assert.equal(new Set(res.assignments.map((a) => a.person)).size, 8);
  assert.deepEqual(who(res, 'greet', DEC[0]), ['Greeter01', 'Greeter02']);
  assert.deepEqual(who(res, 'greet', DEC[1]), ['Greeter03', 'Greeter04']);
});

test('avoids two roles on one Sunday when the pool allows', () => {
  const both = { ...greeters, eligible: ['Alder', 'Birch', 'Cedar', 'Dogwood', 'Elm', 'Fir'] };
  const res = suggestRoster({ month: '2026-12', roles: [songLeaders, both] });
  assert.deepEqual(res.warnings, []);
  for (const d of DEC) {
    const people = [...who(res, 'song', d), ...who(res, 'greet', d)];
    assert.equal(new Set(people).size, people.length);
  }
});

test('small pool: double-books with a warning naming the role', () => {
  const tiny = { id: 'greet', name: 'Greeter', slots: 1, period: 'weekly', eligible: ['Alder'] };
  const res = suggestRoster({ month: '2026-12', roles: [songLeaders, tiny] });
  assert.deepEqual(DEC.map((d) => who(res, 'greet', d)[0]), ['Alder', 'Alder', 'Alder', 'Alder']);
  const w = res.warnings.filter((x) => x.type === 'double-booked');
  // Song leaders rotate Alder, Birch, Cedar, Dogwood, so only the 6th clashes.
  assert.equal(w.length, 1);
  assert.equal(w[0].role, 'greet');
  assert.equal(w[0].date, DEC[0]);
  assert.equal(w[0].person, 'Alder');
  assert.match(w[0].message, /Greeter/);
});

test('double-booking fallback never repeats a person within one role and date', () => {
  const pair = { id: 'greet', name: 'Greeter', slots: 2, period: 'weekly', eligible: ['Alder', 'Birch'] };
  const res = suggestRoster({ month: '2026-12', roles: [songLeaders, pair] });
  for (const d of DEC) assert.equal(new Set(who(res, 'greet', d)).size, 2);
  assert.ok(res.warnings.some((w) => w.type === 'double-booked'));
});

test('short pool leaves the slot empty with a warning', () => {
  const away = SONG.map((person) => ({ person, date: DEC[0] }));
  const res = suggestRoster({ month: '2026-12', roles: [songLeaders], away });
  assert.equal(who(res, 'song', DEC[0])[0], null);
  assert.deepEqual(res.warnings.map((w) => [w.type, w.role, w.date]), [['short-pool', 'song', DEC[0]]]);
  assert.match(res.warnings[0].message, /Song leader/);
  assert.equal(who(res, 'song', DEC[1])[0], 'Alder');
});

test('fewer people than slots: fills what it can, warns for the rest', () => {
  const three = { id: 'usher', name: 'Usher', slots: 3, period: 'weekly', eligible: ['Alder', 'Birch'] };
  const res = suggestRoster({ month: '2026-12', roles: [three] });
  assert.deepEqual(who(res, 'usher', DEC[0]), ['Alder', 'Birch', null]);
  assert.equal(res.warnings.filter((w) => w.type === 'short-pool').length, 4);
});

const monthlyRole = { id: 'bread', name: 'Communion prep', slots: 1, period: 'monthly', eligible: ['Alder', 'Birch', 'Cedar'] };

test('monthly role: one entry for the month, date null, rotates month to month', () => {
  const history = [{ role: 'bread', person: 'Alder', date: '2026-11-29' }];
  const res = suggestRoster({ month: '2026-12', roles: [monthlyRole], history });
  assert.deepEqual(res.assignments, [{ role: 'bread', date: null, slot: 1, person: 'Birch' }]);
});

test('monthly role: away on one Sunday is fine, on two is skipped', () => {
  const one = suggestRoster({ month: '2026-12', roles: [monthlyRole], away: [{ person: 'Alder', date: DEC[0] }] });
  assert.equal(one.assignments[0].person, 'Alder');
  const two = suggestRoster({
    month: '2026-12',
    roles: [monthlyRole],
    away: [{ person: 'Alder', date: DEC[0] }, { person: 'Alder', date: DEC[3] }],
  });
  assert.equal(two.assignments[0].person, 'Birch');
});

test('monthly role with everyone away 2+ Sundays: empty, warning mentions the month', () => {
  const away = ['Alder', 'Birch', 'Cedar'].flatMap((person) => [
    { person, date: DEC[0] },
    { person, date: DEC[1] },
  ]);
  const res = suggestRoster({ month: '2026-12', roles: [monthlyRole], away });
  assert.equal(res.assignments[0].person, null);
  assert.equal(res.warnings[0].type, 'short-pool');
  assert.match(res.warnings[0].message, /in 2026-12/);
});

test('monthly role holds every Sunday: weekly roles avoid that person all month', () => {
  const res = suggestRoster({ month: '2026-12', roles: [songLeaders, monthlyRole] });
  assert.equal(res.assignments.find((a) => a.role === 'bread').person, 'Alder');
  for (const d of DEC) assert.notEqual(who(res, 'song', d)[0], 'Alder');
  assert.deepEqual(res.warnings, []);
});

test('weekly role with a tiny pool double-books a monthly person, once per Sunday', () => {
  const solo = { ...songLeaders, eligible: ['Alder'] };
  const res = suggestRoster({ month: '2026-12', roles: [solo, { ...monthlyRole, eligible: ['Alder'] }] });
  assert.equal(res.assignments.find((a) => a.role === 'bread').person, 'Alder');
  const doubles = res.warnings.filter((w) => w.type === 'double-booked');
  assert.equal(doubles.length, 4);
  assert.ok(doubles.every((w) => w.role === 'song'));
});

test('two monthly roles sharing a person warn on the second', () => {
  const second = { id: 'tidy', name: 'Building tidy', slots: 1, period: 'monthly', eligible: ['Alder'] };
  const res = suggestRoster({ month: '2026-12', roles: [monthlyRole, second] });
  assert.equal(res.assignments.find((a) => a.role === 'tidy').person, 'Alder');
  assert.equal(res.warnings.length, 1);
  assert.equal(res.warnings[0].role, 'tidy');
  assert.match(res.warnings[0].message, /in 2026-12/);
});

test('a role with zero slots produces nothing', () => {
  const res = suggestRoster({ month: '2026-12', roles: [{ ...songLeaders, slots: 0 }] });
  assert.deepEqual(res, { assignments: [], warnings: [] });
});
