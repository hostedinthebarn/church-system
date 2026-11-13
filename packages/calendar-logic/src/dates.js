// Calendar-date and America/Chicago helpers. Dates are 'YYYY-MM-DD' strings,
// times are 'HH:MM', instants are ISO strings in UTC. No dependencies: the
// time zone rules come from Node's built-in Intl.
export const TZ = 'America/Chicago';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const zoneFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric'
});

export function parseDate(s) {
  const m = DATE_RE.exec(s);
  if (!m) {
    throw new RangeError(`Bad date "${s}", expected YYYY-MM-DD`);
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (formatDate(y, mo, d) !== s) {
    throw new RangeError(`Not a real date: "${s}"`);
  }
  return { y, mo, d };
}

export function formatDate(y, mo, d) {
  return new Date(Date.UTC(y, mo - 1, d)).toISOString().slice(0, 10);
}

export function parseTime(s) {
  const m = TIME_RE.exec(s);
  if (!m) {
    throw new RangeError(`Bad time "${s}", expected HH:MM`);
  }
  return { h: Number(m[1]), mi: Number(m[2]) };
}

export function addDays(date, n) {
  const { y, mo, d } = parseDate(date);
  return formatDate(y, mo, d + n);
}

// Same day-of-month n months on, clamped to the month's last day.
export function addMonths(date, n) {
  const { y, mo, d } = parseDate(date);
  const last = daysInMonth(y, mo + n);
  return formatDate(y, mo + n, Math.min(d, last));
}

export function daysInMonth(y, mo) {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

export function weekdayOf(date) {
  const { y, mo, d } = parseDate(date);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

// Offset of America/Chicago from UTC, in minutes, at a UTC instant (ms).
export function offsetMinutes(ms) {
  const whole = Math.floor(ms / 1000) * 1000;
  const p = {};
  for (const { type, value } of zoneFormat.formatToParts(whole)) {
    p[type] = Number(value);
  }
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - whole) / 60000);
}

// Chicago wall-clock date + time to a UTC instant (ms). A time that doesn't
// exist (the spring-forward gap) lands an hour later; an ambiguous one (the
// autumn repeat) takes the first, daylight-time occurrence.
export function localToInstant(date, time) {
  const { y, mo, d } = parseDate(date);
  const { h, mi } = parseTime(time);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = offsetMinutes(guess);
  const t = guess - first * 60000;
  const second = offsetMinutes(t);
  if (second === first) {
    return t;
  }
  const alt = guess - second * 60000;
  return offsetMinutes(alt) === second ? alt : t;
}

// UTC instant (ms or ISO string) to Chicago { date, time }.
export function instantToLocal(instant) {
  const ms = toMs(instant);
  const shifted = new Date(ms + offsetMinutes(ms) * 60000).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

export function toMs(instant) {
  const ms = instant instanceof Date ? instant.getTime() : Date.parse(instant);
  if (Number.isNaN(ms)) {
    throw new RangeError(`Bad instant "${instant}"`);
  }
  return ms;
}

export const DAY_MS = 86400000;
