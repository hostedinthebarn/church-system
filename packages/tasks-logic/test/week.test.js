import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekOf, weekFromStart, nextWeekStart, dueDate } from '../src/week.js';
import { addDays, chicagoDate } from '../src/index.js';
import { parseDate, toInstant } from '../src/dates.js';

test('a mid-week instant lands in Monday to Sunday', () => {
  const week = weekOf('2026-11-12T15:00:00Z');
  assert.equal(week.weekStart, '2026-11-09');
  assert.equal(week.weekEnd, '2026-11-15');
  assert.equal(week.startsAt.toISOString(), '2026-11-09T06:00:00.000Z');
  assert.equal(week.endsAt.toISOString(), '2026-11-16T05:59:59.999Z');
});

test('Monday 00:00 Chicago starts the new week, one millisecond earlier is still last week', () => {
  assert.equal(weekOf('2026-11-09T06:00:00.000Z').weekStart, '2026-11-09');
  assert.equal(weekOf('2026-11-09T05:59:59.999Z').weekStart, '2026-11-02');
});

test('Sunday 23:59 Chicago is still that week; UTC Monday early morning is not Monday yet', () => {
  assert.equal(weekOf('2026-11-16T05:59:00Z').weekStart, '2026-11-09');
  assert.equal(weekOf('2026-11-10T03:00:00Z').weekStart, '2026-11-09');
});

test('accepts Date objects and epoch numbers', () => {
  assert.equal(weekOf(new Date('2026-11-12T15:00:00Z')).weekStart, '2026-11-09');
  assert.equal(weekOf(Date.parse('2026-11-12T15:00:00Z')).weekStart, '2026-11-09');
});

test('fall back (1 Nov 2026): that Sunday is 25 hours and the week is an hour longer', () => {
  const week = weekFromStart('2026-10-26');
  assert.equal(week.startsAt.toISOString(), '2026-10-26T05:00:00.000Z'); // CDT
  assert.equal(week.endsAt.toISOString(), '2026-11-02T05:59:59.999Z'); // CST
  assert.equal(weekOf('2026-11-01T06:30:00Z').weekStart, '2026-10-26'); // 01:30 CST, second 01:30
  assert.equal(weekOf('2026-11-02T05:59:59Z').weekStart, '2026-10-26');
  assert.equal(weekOf('2026-11-02T06:00:00Z').weekStart, '2026-11-02');
});

test('spring forward (8 Mar 2026): the week is an hour shorter', () => {
  const week = weekFromStart('2026-03-02');
  assert.equal(week.startsAt.toISOString(), '2026-03-02T06:00:00.000Z'); // CST
  assert.equal(week.endsAt.toISOString(), '2026-03-09T04:59:59.999Z'); // CDT
  assert.equal(weekOf('2026-03-09T05:00:00Z').weekStart, '2026-03-09');
  assert.equal(weekOf('2026-03-09T04:59:59Z').weekStart, '2026-03-02');
});

test('the DST Monday itself starts at Chicago midnight', () => {
  assert.equal(weekFromStart('2026-03-09').startsAt.toISOString(), '2026-03-09T05:00:00.000Z');
  assert.equal(weekFromStart('2026-11-02').startsAt.toISOString(), '2026-11-02T06:00:00.000Z');
});

test('year boundary and leap day', () => {
  assert.equal(weekOf('2026-12-31T18:00:00Z').weekStart, '2026-12-28');
  assert.equal(weekFromStart('2026-12-28').weekEnd, '2027-01-03');
  assert.equal(weekFromStart('2028-02-28').weekEnd, '2028-03-05');
});

test('a week start must be a real Monday', () => {
  assert.throws(() => weekFromStart('2026-11-10'), /Not a Monday/);
  assert.throws(() => weekFromStart('2026-13-01'), /Not a calendar date/);
  assert.throws(() => weekFromStart('nonsense'), /Not a calendar date/);
  assert.throws(() => weekFromStart('2026-02-30'), /Not a calendar date/);
});

test('invalid instants are rejected', () => {
  assert.throws(() => weekOf('not a time'), /Not a valid instant/);
  assert.throws(() => toInstant(undefined), /Not a valid instant/);
});

test('nextWeekStart steps seven days', () => {
  assert.equal(nextWeekStart('2026-11-09'), '2026-11-16');
  assert.throws(() => nextWeekStart('2026-11-10'), /Not a Monday/);
});

test('date helpers', () => {
  assert.equal(addDays('2026-02-27', 2), '2026-03-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(parseDate('2026-11-09'), Date.UTC(2026, 10, 9));
  assert.equal(chicagoDate('2026-11-10T03:00:00Z'), '2026-11-09');
});

test('day due: weekday names resolve to dates in that week', () => {
  assert.equal(dueDate('2026-11-09', 'monday'), '2026-11-09');
  assert.equal(dueDate('2026-11-09', 'Friday'), '2026-11-13');
  assert.equal(dueDate('2026-11-09', 'SATURDAY'), '2026-11-14');
  assert.equal(dueDate('2026-11-09', 'sunday'), '2026-11-15');
});

test('day due: across the DST week the date is still the right weekday', () => {
  assert.equal(dueDate('2026-10-26', 'sunday'), '2026-11-01');
  assert.equal(dueDate('2026-03-02', 'friday'), '2026-03-06');
});

test('day due: no day means no due date; a bad day is an error', () => {
  assert.equal(dueDate('2026-11-09', null), null);
  assert.equal(dueDate('2026-11-09', undefined), null);
  assert.throws(() => dueDate('2026-11-09', 'someday'), /Not a weekday/);
  assert.throws(() => dueDate('2026-11-11', 'friday'), /Not a Monday/);
});
