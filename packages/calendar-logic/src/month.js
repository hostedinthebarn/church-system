// The month calendar (LGC-42): which month a request means, and the grid and
// day list for it. Pure: dates are Chicago wall-clock 'YYYY-MM-DD' strings, so
// daylight-saving changes can't move an event to another day.
import { addDays, daysInMonth, formatDate, weekdayOf } from './dates.js';

const MONTH_RE = /^(\d{4})-(\d{2})$/;
// Years the date helpers handle without surprises: Date.UTC reads 0-99 as 19xx,
// and 10000 is written with a sign. The last year leaves room for the grid's
// padding days.
export const FIRST_YEAR = 1000;
export const LAST_YEAR = 9998;

const pad = n => String(n).padStart(2, '0');

// 'YYYY-MM' to { y, mo }, or null if it isn't a real month.
export function parseMonth(value) {
  const m = MONTH_RE.exec(typeof value === 'string' ? value : '');
  const y = m ? Number(m[1]) : 0;
  const mo = m ? Number(m[2]) : 0;
  return y >= FIRST_YEAR && y <= LAST_YEAR && mo >= 1 && mo <= 12 ? { y, mo } : null;
}

export function monthKey({ y, mo }) {
  return `${y}-${pad(mo)}`;
}

// The month a request asks for: `month` ('2026-12'), else `y` and `m` from the
// picker form, else the month `today` is in. Never throws.
export function monthFromQuery(query, today) {
  const q = query || {};
  const asked = parseMonth(q.month) || parseMonth(`${q.y}-${String(q.m).padStart(2, '0')}`);
  return asked || parseMonth(today.slice(0, 7));
}

// The month before or after, or null past the years we handle.
export function shiftMonth({ y, mo }, n) {
  const index = y * 12 + (mo - 1) + n;
  const next = {
    y: Math.floor(index / 12),
    mo: index % 12 + 1
  };
  return next.y < FIRST_YEAR || next.y > LAST_YEAR ? null : next;
}

// First and last date of a month.
export function monthBounds({ y, mo }) {
  return {
    first: formatDate(y, mo, 1),
    last: formatDate(y, mo, daysInMonth(y, mo))
  };
}

// Events are { id, title, startDate, endDate, ...whatever the page shows }. A
// multi-day event is on every day it touches. Returns:
//   weeks: rows of 7 days (Sunday first), padded with the neighbouring months'
//          days, each { date, day, inMonth, isToday, events };
//   days:  only the days of the month that have events, for the phone list.
export function buildMonth(month, events, today) {
  const { first, last } = monthBounds(month);
  const byDate = new Map();
  const ordered = [ ...events ].sort((a, b) =>
    (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
  for (const event of ordered) {
    const end = event.endDate || event.startDate;
    let date = event.startDate < first ? first : event.startDate;
    for (; date <= last && date <= end; date = addDays(date, 1)) {
      if (!byDate.has(date)) {
        byDate.set(date, []);
      }
      byDate.get(date).push({
        ...event,
        isFirstDay: date === event.startDate
      });
    }
  }
  const gridStart = addDays(first, -weekdayOf(first));
  const weeks = [];
  for (let date = gridStart; date <= last; date = addDays(date, 7)) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(date, i);
      const inMonth = day >= first && day <= last;
      week.push({
        date: day,
        day: Number(day.slice(8)),
        inMonth,
        isToday: day === today,
        events: inMonth ? byDate.get(day) || [] : []
      });
    }
    weeks.push(week);
  }
  const days = weeks.flat().filter(d => d.events.length);
  return {
    weeks,
    days
  };
}
