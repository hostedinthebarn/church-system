import {
  addDays,
  daysInMonth,
  formatDate,
  localToInstant,
  parseDate,
  parseTime,
  weekdayOf
} from './dates.js';

// nth weekday of a month: nth 1-4, or -1 for the last. weekday 0 = Sunday.
export function nthWeekdayOfMonth(y, mo, weekday, nth) {
  if (nth === -1) {
    const dim = daysInMonth(y, mo);
    const lastWeekday = weekdayOf(formatDate(y, mo, dim));
    return formatDate(y, mo, dim - ((lastWeekday - weekday + 7) % 7));
  }
  const firstWeekday = weekdayOf(formatDate(y, mo, 1));
  return formatDate(y, mo, 1 + ((weekday - firstWeekday + 7) % 7) + 7 * (nth - 1));
}

function validate(rule) {
  parseDate(rule.start);
  parseTime(rule.time);
  if (rule.until !== undefined) {
    parseDate(rule.until);
  }
  if (rule.freq === 'weekly') {
    if (rule.interval !== undefined && !(Number.isInteger(rule.interval) && rule.interval >= 1)) {
      throw new RangeError('interval must be a whole number, 1 or more');
    }
  } else if (rule.freq === 'monthly') {
    if (![1, 2, 3, 4, -1].includes(rule.nth)) {
      throw new RangeError('nth must be 1, 2, 3, 4 or -1 (last)');
    }
    if (!Number.isInteger(rule.weekday) || rule.weekday < 0 || rule.weekday > 6) {
      throw new RangeError('weekday must be 0 (Sunday) to 6 (Saturday)');
    }
  } else {
    throw new RangeError(`Unknown repeat "${rule.freq}", expected weekly or monthly`);
  }
}

function* ruleDates(rule, limit) {
  if (rule.freq === 'weekly') {
    const step = 7 * (rule.interval ?? 1);
    for (let d = rule.start; d <= limit; d = addDays(d, step)) {
      yield d;
    }
    return;
  }
  const { y, mo } = parseDate(rule.start);
  let d = nthWeekdayOfMonth(y, mo, rule.weekday, rule.nth);
  for (let i = 1; d <= limit; i++) {
    if (d >= rule.start) {
      yield d;
    }
    d = nthWeekdayOfMonth(y, mo + i, rule.weekday, rule.nth);
  }
}

// Expand a repeat rule into occurrences from rule.start up to and including
// `through` (a date) or rule.until, whichever is earlier.
//
// rule: { freq: 'weekly', start, time, durationMinutes?, interval?, until? }
//       { freq: 'monthly', start, time, nth, weekday, durationMinutes?, until? }
// Wall-clock time stays the same across daylight-saving changes (a 10:00
// service is 10:00 in January and in July), so the UTC instants shift.
// Returns [{ date, startsAt, endsAt }] with ISO UTC instants.
export function expandRule(rule, through) {
  validate(rule);
  parseDate(through);
  const limit = rule.until !== undefined && rule.until < through ? rule.until : through;
  const minutes = rule.durationMinutes ?? 0;
  const out = [];
  for (const date of ruleDates(rule, limit)) {
    const start = localToInstant(date, rule.time);
    out.push({
      date,
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(start + minutes * 60000).toISOString()
    });
  }
  return out;
}
