import test from 'node:test';
import assert from 'node:assert/strict';
import { expandRule, nthWeekdayOfMonth } from '../src/repeat.js';

const sunday = { freq: 'weekly', start: '2026-10-25', time: '10:00', durationMinutes: 60 };

test('weekly stays at 10:00 Chicago across the November fall-back', () => {
  const occ = expandRule(sunday, '2026-11-15');
  assert.deepEqual(occ.map((o) => o.date), ['2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15']);
  assert.equal(occ[0].startsAt, '2026-10-25T15:00:00.000Z'); // CDT
  assert.equal(occ[1].startsAt, '2026-11-01T16:00:00.000Z'); // CST from Nov 1
  assert.equal(occ[0].endsAt, '2026-10-25T16:00:00.000Z');
});

test('weekly across the March spring-forward', () => {
  const occ = expandRule({ freq: 'weekly', start: '2026-03-01', time: '18:30' }, '2026-03-15');
  assert.deepEqual(occ.map((o) => o.startsAt), [
    '2026-03-02T00:30:00.000Z', '2026-03-08T23:30:00.000Z', '2026-03-15T23:30:00.000Z'
  ]);
});

test('weekly with interval and until', () => {
  const occ = expandRule({ ...sunday, interval: 2, until: '2026-11-20' }, '2027-01-01');
  assert.deepEqual(occ.map((o) => o.date), ['2026-10-25', '2026-11-08']);
  assert.equal(occ[0].endsAt, '2026-10-25T16:00:00.000Z');
});

test('until later than through is ignored; zero duration default', () => {
  const occ = expandRule({ freq: 'weekly', start: '2026-10-25', time: '10:00', until: '2030-01-01' }, '2026-10-26');
  assert.equal(occ.length, 1);
  assert.equal(occ[0].startsAt, occ[0].endsAt);
});

test('nothing before start; through before start gives none', () => {
  assert.deepEqual(expandRule(sunday, '2026-10-01'), []);
});

test('monthly on the first Sunday, year boundary', () => {
  const rule = { freq: 'monthly', start: '2026-11-01', time: '12:00', nth: 1, weekday: 0 };
  const occ = expandRule(rule, '2027-02-28');
  assert.deepEqual(occ.map((o) => o.date), ['2026-11-01', '2026-12-06', '2027-01-03', '2027-02-07']);
  assert.equal(occ[0].startsAt, '2026-11-01T18:00:00.000Z'); // CST by noon
});

test('monthly skips the start month when its nth weekday has already passed', () => {
  const rule = { freq: 'monthly', start: '2026-11-10', time: '12:00', nth: 1, weekday: 0 };
  assert.deepEqual(expandRule(rule, '2027-01-31').map((o) => o.date), ['2026-12-06', '2027-01-03']);
});

test('monthly on the last Friday', () => {
  const rule = { freq: 'monthly', start: '2026-01-01', time: '19:00', nth: -1, weekday: 5, until: '2026-04-30' };
  assert.deepEqual(expandRule(rule, '2026-12-31').map((o) => o.date), [
    '2026-01-30', '2026-02-27', '2026-03-27', '2026-04-24'
  ]);
});

test('nthWeekdayOfMonth', () => {
  assert.equal(nthWeekdayOfMonth(2026, 11, 0, 4), '2026-11-22');
  assert.equal(nthWeekdayOfMonth(2026, 11, 0, -1), '2026-11-29');
  assert.equal(nthWeekdayOfMonth(2026, 2, 6, -1), '2026-02-28'); // last day is that weekday
  assert.equal(nthWeekdayOfMonth(2026, 14, 3, 1), '2027-02-03'); // month overflow
});

test('validation', () => {
  const bad = (rule, re) => assert.throws(() => expandRule(rule, '2027-01-01'), re);
  bad({ ...sunday, start: 'x' }, RangeError);
  bad({ ...sunday, time: '25:00' }, RangeError);
  bad({ ...sunday, until: 'x' }, RangeError);
  bad({ ...sunday, interval: 0 }, /interval/);
  bad({ ...sunday, interval: 1.5 }, /interval/);
  bad({ freq: 'monthly', start: '2026-11-01', time: '10:00', nth: 5, weekday: 0 }, /nth/);
  bad({ freq: 'monthly', start: '2026-11-01', time: '10:00', nth: 1, weekday: 7 }, /weekday/);
  bad({ freq: 'monthly', start: '2026-11-01', time: '10:00', nth: 1, weekday: 1.5 }, /weekday/);
  bad({ freq: 'monthly', start: '2026-11-01', time: '10:00', nth: 1, weekday: -1 }, /weekday/);
  bad({ freq: 'daily', start: '2026-11-01', time: '10:00' }, /Unknown repeat/);
  assert.throws(() => expandRule(sunday, 'x'), RangeError);
});
