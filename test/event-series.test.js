const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clock, instants, nthOf, ruleFor, firstOccurrences
} = require('../lib/event-series.js');

test('the time field in any of its formats becomes HH:MM', () => {
  assert.equal(clock('09:00:00'), '09:00');
  assert.equal(clock('9:05'), '09:05');
  assert.equal(clock('05:30 PM'), '17:30');
  assert.equal(clock('12:00 AM'), '00:00');
  assert.equal(clock('12:15 pm'), '12:15');
  assert.throws(() => clock('noon'), RangeError);
  assert.throws(() => clock(undefined), RangeError);
});

test('instants are Chicago wall-clock times', () => {
  const winter = instants({
    startDate: '2027-01-03',
    startTime: '10:00:00',
    endTime: '11:30:00'
  });
  assert.equal(winter.start.toISOString(), '2027-01-03T16:00:00.000Z');
  assert.equal(winter.durationMinutes, 90);
  const summer = instants({
    startDate: '2027-07-04',
    startTime: '10:00:00',
    endTime: '11:00:00'
  });
  assert.equal(summer.start.toISOString(), '2027-07-04T15:00:00.000Z');
  const days = instants({
    startDate: '2027-01-03',
    endDate: '2027-01-05',
    allDay: true
  });
  assert.equal(days.start.toISOString(), '2027-01-03T06:00:00.000Z');
  assert.equal(days.end.toISOString(), '2027-01-06T05:59:59.000Z');
});

test('nth is 1 to 4, and a 5th weekday means the last', () => {
  assert.equal(nthOf('2027-01-03'), 1);
  assert.equal(nthOf('2027-01-28'), 4);
  assert.equal(nthOf('2027-01-31'), -1);
});

test('a rule comes from the fields', () => {
  assert.deepEqual(ruleFor({
    repeatPattern: 'nth-weekday',
    startDate: '2027-01-03',
    startTime: '12:00 PM',
    endTime: '01:00 PM',
    repeatEnds: 'until',
    repeatUntil: '2027-06-01'
  }), {
    freq: 'monthly',
    start: '2027-01-03',
    time: '12:00',
    durationMinutes: 60,
    nth: 1,
    weekday: 0,
    until: '2027-06-01'
  });
  assert.equal(ruleFor({
    repeatPattern: 'weekly',
    startDate: '2027-01-03',
    startTime: '10:00',
    endTime: '11:00'
  }).freq, 'weekly');
});

test('first occurrences: by count, until a date, or filled a year ahead', () => {
  const piece = {
    repeatPattern: 'weekly',
    startDate: '2027-01-03',
    startTime: '10:00',
    endTime: '11:00'
  };
  assert.equal(firstOccurrences({
    ...piece,
    repeatEnds: 'count',
    repeatCount: 3
  }, '2026-11-17').length, 3);
  assert.equal(firstOccurrences({
    ...piece,
    repeatEnds: 'count',
    repeatCount: 'x'
  }, '2026-11-17').length, 1);
  assert.equal(firstOccurrences({
    ...piece,
    repeatEnds: 'count',
    repeatCount: 1000
  }, '2026-11-17').length, 520);
  assert.equal(firstOccurrences({
    ...piece,
    repeatPattern: 'nth-weekday',
    repeatEnds: 'count',
    repeatCount: 4
  }, '2026-11-17').length, 4);
  assert.equal(firstOccurrences({
    ...piece,
    repeatEnds: 'until',
    repeatUntil: '2027-01-17'
  }, '2026-11-17').length, 3);
  const open = firstOccurrences({
    ...piece,
    repeatEnds: 'never'
  }, '2026-11-17');
  assert.equal(open[0].date, '2027-01-03');
  assert.equal(open.at(-1).date, '2027-11-14');
});
