import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, addMonths, formatDate, instantToLocal, localToInstant, offsetMinutes,
  parseDate, parseTime, toMs, weekdayOf, daysInMonth
} from '../src/dates.js';

test('parseDate accepts real dates and rejects bad ones', () => {
  assert.deepEqual(parseDate('2026-11-15'), { y: 2026, mo: 11, d: 15 });
  assert.throws(() => parseDate('15/11/2026'), RangeError);
  assert.throws(() => parseDate('2026-02-30'), /Not a real date/);
});

test('parseTime', () => {
  assert.deepEqual(parseTime('09:30'), { h: 9, mi: 30 });
  assert.throws(() => parseTime('9:30'), RangeError);
  assert.throws(() => parseTime('24:00'), RangeError);
});

test('date arithmetic', () => {
  assert.equal(formatDate(2026, 13, 1), '2027-01-01');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-11-13', 12), '2027-11-13');
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(weekdayOf('2026-11-15'), 0);
});

test('offsets and local/instant conversion across DST', () => {
  assert.equal(offsetMinutes(Date.parse('2026-01-15T12:00:00Z')), -360);
  assert.equal(offsetMinutes(Date.parse('2026-07-15T12:00:00.500Z')), -300);
  assert.equal(new Date(localToInstant('2026-01-15', '10:00')).toISOString(), '2026-01-15T16:00:00.000Z');
  assert.equal(new Date(localToInstant('2026-07-15', '10:00')).toISOString(), '2026-07-15T15:00:00.000Z');
  // Spring forward 2026-03-08: 02:30 does not exist, lands at 03:30 CDT.
  assert.equal(new Date(localToInstant('2026-03-08', '02:30')).toISOString(), '2026-03-08T08:30:00.000Z');
  // Fall back 2026-11-01: 01:30 happens twice, first (CDT) wins.
  assert.equal(new Date(localToInstant('2026-11-01', '01:30')).toISOString(), '2026-11-01T06:30:00.000Z');
  // Just after the fall-back, 02:30 CST.
  assert.equal(new Date(localToInstant('2026-11-01', '02:30')).toISOString(), '2026-11-01T08:30:00.000Z');
  // Midnight local and midnight-crossing UTC.
  assert.deepEqual(instantToLocal('2026-07-16T03:30:00Z'), { date: '2026-07-15', time: '22:30' });
  assert.deepEqual(instantToLocal(new Date('2026-01-16T05:59:00Z')), { date: '2026-01-15', time: '23:59' });
});

test('toMs takes strings and Dates, rejects junk', () => {
  assert.equal(toMs('2026-01-01T00:00:00Z'), 1767225600000);
  assert.equal(toMs(new Date(1767225600000)), 1767225600000);
  assert.throws(() => toMs('nope'), RangeError);
});
