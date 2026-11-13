// Calendar-date and time-zone helpers. Dates are 'YYYY-MM-DD' strings; the
// church's clock is America/Chicago, so "Monday 00:00" means Chicago midnight.

export const TIME_ZONE = 'America/Chicago';

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

export function parseDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const ms = match && Date.UTC(+match[1], +match[2] - 1, +match[3]);
  if (!match || formatDate(ms) !== text) {
    throw new RangeError(`Not a calendar date (YYYY-MM-DD): ${text}`);
  }
  return ms;
}

export function formatDate(utcMs) {
  return new Date(utcMs).toISOString().slice(0, 10);
}

export function addDays(dateText, days) {
  return formatDate(parseDate(dateText) + days * 86400000);
}

export function toInstant(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Not a valid instant: ${String(value)}`);
  }
  return date;
}

// The wall-clock time in Chicago at an instant, read as if it were UTC.
function chicagoWallClockAsUtc(ms) {
  const p = {};
  for (const { type, value } of formatter.formatToParts(new Date(ms))) {
    p[type] = Number(value);
  }
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

function offsetMs(ms) {
  return chicagoWallClockAsUtc(ms) - Math.floor(ms / 1000) * 1000;
}

// The Chicago calendar date at an instant.
export function chicagoDate(instant) {
  return formatDate(chicagoWallClockAsUtc(toInstant(instant).getTime()));
}

// The instant at which a Chicago calendar date begins. Midnight is never inside
// a DST gap here (the changes happen at 02:00), and the second pass settles the
// offset when the guess lands on the other side of a change.
export function startOfChicagoDay(dateText) {
  const guess = parseDate(dateText);
  const first = guess - offsetMs(guess);
  return new Date(guess - offsetMs(first));
}
