// How a stored event becomes a repeat rule and instants (LGC-41). Plain
// functions: the Chicago time rules and repeat expansion live in
// @church-system/calendar-logic, this file only translates the event module's
// fields into what that package takes.
const { localToInstant, expandRule } = require('@church-system/calendar-logic');
const {
  addDays, addMonths, weekdayOf, parseDate
} = require('@church-system/calendar-logic/src/dates.js');

// The time field gives 'HH:MM:SS', 'HH:MM' or '09:00 AM'; calendar-logic wants
// 24-hour 'HH:MM'.
function clock(value) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/.exec(String(value || '').trim());
  if (!m) {
    throw new RangeError(`Bad time "${value}"`);
  }
  let hour = Number(m[1]);
  if (m[3]) {
    const pm = m[3].toLowerCase() === 'pm';
    hour = hour % 12 + (pm ? 12 : 0);
  }
  return `${String(hour).padStart(2, '0')}:${m[2]}`;
}

// start/end instants and the minutes between them, for one dated event.
function instants({
  startDate, endDate, allDay, startTime, endTime
}) {
  const lastDate = endDate || startDate;
  if (allDay) {
    const start = localToInstant(startDate, '00:00');
    // 23:59:59 on the last day, as @apostrophecms/event does.
    const end = localToInstant(addDays(lastDate, 1), '00:00') - 1000;
    return {
      start: new Date(start),
      end: new Date(end),
      durationMinutes: 0
    };
  }
  const from = clock(startTime);
  const to = clock(endTime);
  const start = localToInstant(startDate, from);
  const end = localToInstant(lastDate, to);
  return {
    start: new Date(start),
    end: new Date(end),
    durationMinutes: Math.max(0, Math.round((end - start) / 60000))
  };
}

// 1st to 4th, and 5th meaning the last: a 5th weekday is always the month's
// last one.
function nthOf(date) {
  const nth = Math.ceil(parseDate(date).d / 7);
  return nth === 5 ? -1 : nth;
}

// The repeat rule an event stores, from its fields. `pattern` is 'weekly' or
// 'nth-weekday'; the nth and weekday of a monthly rule come from the start
// date (a first-Sunday event starting on a first Sunday).
function ruleFor(piece) {
  const rule = {
    freq: piece.repeatPattern === 'nth-weekday' ? 'monthly' : 'weekly',
    start: piece.startDate,
    time: clock(piece.startTime),
    durationMinutes: instants({
      ...piece,
      endDate: piece.startDate
    }).durationMinutes
  };
  if (rule.freq === 'monthly') {
    rule.nth = nthOf(piece.startDate);
    rule.weekday = weekdayOf(piece.startDate);
  }
  if (piece.repeatEnds === 'until' && piece.repeatUntil) {
    rule.until = piece.repeatUntil;
  }
  return rule;
}

// The occurrence dates a freshly saved series starts with, first one included.
// Open-ended series are filled `months` ahead of `today`; the nightly job
// keeps them there. A count is the total number of occurrences.
function firstOccurrences(piece, today, months = 12) {
  const rule = ruleFor(piece);
  if (piece.repeatEnds === 'never') {
    const through = addMonths(today, months);
    return expandRule(rule, through);
  }
  if (piece.repeatEnds === 'until') {
    return expandRule(rule, rule.until);
  }
  // A count is bounded: no pattern needs more than 53 weeks a year, and 520
  // occurrences (ten years of weekly events) is the ceiling.
  const count = Math.min(Math.max(parseInt(piece.repeatCount, 10) || 1, 1), 520);
  const step = rule.freq === 'weekly' ? 7 : 31;
  return expandRule(rule, addDays(rule.start, step * count)).slice(0, count);
}

module.exports = {
  clock,
  instants,
  nthOf,
  ruleFor,
  firstOccurrences
};
