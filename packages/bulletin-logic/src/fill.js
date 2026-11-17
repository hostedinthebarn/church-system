// Fills the bulletin from the church's records. Pure: the caller passes in
// plain data and gets plain data back.
import { bulletinEvents, TZ } from '@church-system/calendar-logic';
import { SERVING_ROLES } from './sections.js';

// ---- Dates -----------------------------------------------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date) {
  const m = DATE_RE.exec(date || '');
  if (!m) {
    throw new RangeError(`Date must be YYYY-MM-DD, got ${JSON.stringify(date)}`);
  }
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function addDaysIso(date, n) {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function weekdayIndex(date) {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isSunday(date) {
  return weekdayIndex(date) === 0;
}

// "Sunday, November 15, 2026"
export function longDate(date) {
  const { y, m, d } = parts(date);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

// "Sun, Nov 22 at 6:30 pm" in the church's time zone.
export function whenText(instant) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  });
  const p = Object.fromEntries(f.formatToParts(new Date(instant)).map(x => [ x.type, x.value ]));
  const time = p.minute === '00' ? `${p.hour} ${p.dayPeriod.toLowerCase()}` : `${p.hour}:${p.minute} ${p.dayPeriod.toLowerCase()}`;
  return `${p.weekday}, ${p.month} ${p.day} at ${time}`;
}

// ---- Typed text ------------------------------------------------------------

// What the office types: blank-line separated paragraphs, and lines starting
// with "- " are a list. Nothing else is interpreted.
export function textToBlocks(text) {
  const blocks = [];
  let paragraph = [];
  let list = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: 'text', text: paragraph.join('\n') });
      paragraph = [];
    }
    if (list.length) {
      blocks.push({ type: 'list', items: list });
      list = [];
    }
  };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (/^[-*] /.test(line)) {
      if (paragraph.length) {
        flush();
      }
      list.push(line.slice(2).trim());
    } else {
      if (list.length) {
        flush();
      }
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

// ---- Roster ----------------------------------------------------------------

// `assignments` are roster-logic's: [{ role, date, slot, person }] with
// person an id or null; `names` maps an id to the name to print. A monthly
// role has date null and covers every Sunday. A slot nobody holds is null in
// the row's names: the screen says "unfilled"; nobody is ever invented.
export function fillServing({ assignments = [], names = {}, sunday, roles = SERVING_ROLES }) {
  const groups = [];
  let unfilled = 0;
  for (const [ index, date ] of [ sunday, addDaysIso(sunday, 7) ].entries()) {
    const rows = roles.map(role => {
      const mine = assignments
        .filter(a => a.role === role.role && (a.date === date || a.date === null));
      const people = Array.from({ length: role.slots }, (_, slot) => {
        const found = mine.find(a => a.slot === slot);
        return found && found.person && names[found.person] ? names[found.person] : null;
      });
      unfilled += people.filter(name => name === null).length;
      return { label: role.label, names: people };
    });
    groups.push({ heading: `${index === 0 ? 'Those Serving Today' : 'Those to Serve Next Sunday'}`, date, rows });
  }
  return { groups, unfilled };
}

// ---- Events ----------------------------------------------------------------

const STATUS_LABEL = { cancelled: 'CANCELLED', changed: 'CHANGED' };

// The events the bulletin window picks (calendar-logic), each marked with
// whether it is ticked. `choices = { [eventId]: { include?, membersOk? } }`.
// A public event is ticked unless the office or the event itself unticks it.
// A members-only event is ticked only when the office ticks "members-only OK"
// (Gary, 2026-11-16). Cancelled or changed events stay in the list.
export function fillEvents({ events = [], printDate, choices = {} }) {
  // The event's own `inBulletin` is the default tick, not a filter, so the
  // office can still see and re-tick it.
  const original = new Map(events.map(e => [ e.id, e ]));
  const candidates = bulletinEvents(events.map(e => ({ ...e, inBulletin: undefined })), printDate)
    .map(({ id }) => original.get(id))
    .map(e => {
      const choice = choices[e.id] || {};
      const memberOnly = e.visibility === 'members';
      const include = memberOnly
        ? choice.membersOk === true && choice.include !== false
        : (typeof choice.include === 'boolean' ? choice.include : e.inBulletin !== false);
      return {
        id: e.id,
        title: e.title,
        when: whenText(e.startsAt),
        location: e.location || '',
        status: e.status,
        statusLabel: STATUS_LABEL[e.status] || '',
        memberOnly,
        include
      };
    });
  return { candidates, included: candidates.filter(c => c.include) };
}

// ---- Birthdays and anniversaries -------------------------------------------

function ageOn(dateOfBirth, today) {
  const b = DATE_RE.exec(dateOfBirth || '');
  if (!b) {
    return null;
  }
  const t = parts(today);
  const passed = t.m > Number(b[2]) || (t.m === Number(b[2]) && t.d >= Number(b[3]));
  return t.y - Number(b[1]) - (passed ? 0 : 1);
}

// Adults only. With no date of birth we can't say, and for a printed list
// that means leaving the person out (the opposite of the directory's rule,
// which treats the unknown as a minor for the same reason: the safe side).
function listable(person, today) {
  const age = ageOn(person.dateOfBirth, today);
  return age !== null && age >= 18 && !person.inactiveReason;
}

function monthDay(date) {
  return date.slice(5);
}

// 'MM-DD' strings for the 7 days from `from`, with a 29 Feb date also
// matching 28 Feb in a common year.
function weekDays(from) {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(from, i));
}

function matchesDay(stored, day) {
  if (!DATE_RE.test(stored || '')) {
    return false;
  }
  if (monthDay(stored) === monthDay(day)) {
    return true;
  }
  const { y } = parts(day);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return monthDay(stored) === '02-29' && monthDay(day) === '02-28' && !leap;
}

// People: [{ id, name, dateOfBirth, inactiveReason, hiddenFields }].
// Spouse links: [{ personA, personB, anniversary, deceased }] (ids). Only
// adults who are active, with the date not hidden, and no one who has died or
// whose spouse has. Never an age, a year or a baptism date.
export function fillBirthdays({ people = [], relationships = [], from }) {
  const byId = new Map(people.map(person => [ person.id, person ]));
  const items = [];
  const days = weekDays(from);
  for (const day of days) {
    for (const person of people) {
      if (listable(person, day) && !(person.hiddenFields || []).includes('birthday') &&
        matchesDay(person.dateOfBirth, day)) {
        items.push({ kind: 'birthday', date: day, text: person.name });
      }
    }
    for (const link of relationships) {
      const a = byId.get(link.personA);
      const b = byId.get(link.personB);
      if (!a || !b || link.deceased || !listable(a, day) || !listable(b, day)) {
        continue;
      }
      if ((a.hiddenFields || []).includes('anniversary') || (b.hiddenFields || []).includes('anniversary')) {
        continue;
      }
      if (matchesDay(link.anniversary, day)) {
        items.push({ kind: 'anniversary', date: day, text: `${a.name} & ${b.name}` });
      }
    }
  }
  return items;
}
