// What the roster screens need beyond the suggestion: checking an adjusted
// roster, swaps, the printable shape and the "next month" task. Pure, like
// roster.js: no I/O, no clock, no database.
//
// A roster is the same list `suggestRoster` returns: [{ role, date, slot, person }],
// `date` the Sunday for weekly roles and null for monthly ones, `slot` from 1,
// `person` null for an empty slot.
import { sundaysOf } from './roster.js';

const DAY_MS = 86400000;

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function nextMonthOf(date) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

// Away spans [{ person, startDate, endDate? }] as the per-Sunday list
// suggestRoster takes: [{ person, date }], only for the month's Sundays.
export function awaySundays(spans, month) {
  const sundays = sundaysOf(month);
  const found = [];
  for (const span of spans) {
    const end = span.endDate || span.startDate;
    for (const date of sundays) {
      if (date >= span.startDate && date <= end) found.push({ person: span.person, date });
    }
  }
  return found;
}

// Problems in a roster as the coordinator has adjusted it, so the screen can show
// them again after every change. Types: 'empty' (a slot nobody holds), 'duplicate'
// (the same person twice in one role on one date), 'double-booked' (two roles on one
// Sunday; a monthly role holds every Sunday), 'away' (marked away on the date; for a
// monthly role, on any Sunday of the month). `names` maps a person id to what to print.
export function checkRoster({ month, roles, assignments, away = [], names = {} }) {
  const sundays = sundaysOf(month);
  const name = (person) => names[person] ?? person;
  const awayOn = new Set(away.map((entry) => `${entry.person}|${entry.date}`));
  const warnings = [];
  const holds = new Map(); // `${person}|${sunday}` -> role names

  for (const role of roles) {
    const monthly = role.period === 'monthly';
    for (const date of monthly ? [null] : sundays) {
      const covered = monthly ? sundays : [date];
      const seen = new Set();
      for (let slot = 1; slot <= role.slots; slot++) {
        const found = assignments.find((a) => a.role === role.id && a.date === date && a.slot === slot);
        const person = found?.person ?? null;
        const where = monthly ? ` in ${month}` : ` on ${date}`;
        if (person === null) {
          warnings.push({ type: 'empty', role: role.id, date, message: `${role.name}: slot ${slot}${where} is empty.` });
          continue;
        }
        if (seen.has(person)) {
          warnings.push({ type: 'duplicate', role: role.id, date, person, message: `${role.name}: ${name(person)} is down twice${where}.` });
        }
        seen.add(person);
        const awayDates = covered.filter((day) => awayOn.has(`${person}|${day}`));
        if (awayDates.length > 0) {
          warnings.push({
            type: 'away',
            role: role.id,
            date,
            person,
            message: `${role.name}: ${name(person)} is away ${monthly ? awayDates.join(', ') : date}.`
          });
        }
        for (const day of covered) {
          const key = `${person}|${day}`;
          holds.set(key, [...(holds.get(key) ?? []), role.name]);
        }
      }
    }
  }

  for (const [key, roleNames] of holds) {
    const distinct = [...new Set(roleNames)];
    if (distinct.length < 2) continue;
    const [person, day] = key.split('|');
    warnings.push({
      type: 'double-booked',
      role: null,
      date: day,
      person,
      message: `${name(person)} has ${distinct.join(' and ')} on ${day}.`
    });
  }
  return warnings;
}

// Puts `person` (an id, or null to empty it) into one slot. Returns the new list and
// who held the slot before. The input is not changed.
export function swapSlot(assignments, { role, date, slot }, person) {
  const index = assignments.findIndex((a) => a.role === role && a.date === date && a.slot === slot);
  if (index === -1) throw new RangeError(`No such slot: ${role} ${date ?? 'month'} ${slot}`);
  const previous = assignments[index].person;
  const next = assignments.map((a, i) => (i === index ? { ...a, person } : a));
  return { assignments: next, previous };
}

// Slots whose holder differs between two versions: [{ role, date, slot, from, to }].
// A slot present in only one version counts as empty in the other.
export function diffAssignments(before, after) {
  const keyOf = (a) => `${a.role}|${a.date}|${a.slot}`;
  const was = new Map(before.map((a) => [keyOf(a), a]));
  const is = new Map(after.map((a) => [keyOf(a), a]));
  const changes = [];
  for (const key of new Set([...was.keys(), ...is.keys()])) {
    const from = was.get(key)?.person ?? null;
    const to = is.get(key)?.person ?? null;
    if (from === to) continue;
    const { role, date, slot } = (was.get(key) ?? is.get(key));
    changes.push({ role, date, slot, from, to });
  }
  return changes;
}

// The roster laid out for the printable list and the monthly email.
//   { month, monthly: [{ role, name, people }], weekly: [{ date, rows: [{ role, name, people }] }] }
// `people` has one entry per slot: the printed name, or null when nobody holds it.
export function layoutRoster({ month, roles, assignments, names = {} }) {
  const row = (role, date) => ({
    role: role.id,
    name: role.name,
    people: Array.from({ length: role.slots }, (_, index) => {
      const found = assignments.find((a) => a.role === role.id && a.date === date && a.slot === index + 1);
      return found?.person ? (names[found.person] ?? found.person) : null;
    })
  });
  return {
    month,
    monthly: roles.filter((r) => r.period === 'monthly').map((role) => row(role, null)),
    weekly: sundaysOf(month).map((date) => ({
      date,
      rows: roles.filter((r) => r.period === 'weekly').map((role) => row(role, date))
    }))
  };
}

// The layout as plain text, for the email. `labels` supplies the words so the caller can
// translate them: { allMonth, unfilled }.
export function layoutText(layout, labels = { allMonth: 'All month', unfilled: '(unfilled)' }) {
  const line = (row) => `${row.name}: ${row.people.map((p) => p ?? labels.unfilled).join(', ') || labels.unfilled}`;
  const blocks = [];
  if (layout.monthly.length > 0) blocks.push([labels.allMonth, ...layout.monthly.map(line)].join('\n'));
  for (const week of layout.weekly) blocks.push([week.date, ...week.rows.map(line)].join('\n'));
  return blocks.join('\n\n');
}

// What a person is down for, in date order: [{ role, name, date, slot }]; date null for
// a monthly role.
export function dutiesOf({ person, roles, assignments }) {
  const byId = new Map(roles.map((role) => [role.id, role]));
  return assignments
    .filter((a) => a.person === person && byId.has(a.role))
    .map((a) => ({ role: a.role, name: byId.get(a.role).name, date: a.date, slot: a.slot }))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}

// The weekly tasks list's "next month's roster" (weekly-tasks-poc): a system condition,
// in the shape tasks-logic's syncSystemItems takes, from two weeks before next month
// starts until that month's roster is published. `published` lists published months.
// It is due a week before the month starts, which is also when the list's own clock
// would show it overdue.
export function rosterConditions({ today, published = [], leadDays = 14 }) {
  const month = nextMonthOf(today);
  const start = `${month}-01`;
  if (today < addDays(start, -leadDays) || published.includes(month)) return [];
  return [
    {
      sourceKey: `roster:${month}`,
      title: `Build and publish the servers roster for ${month}`,
      owner: null,
      dueDate: addDays(start, -7),
      month
    }
  ];
}
