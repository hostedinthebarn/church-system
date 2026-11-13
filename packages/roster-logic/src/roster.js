// Suggested rotation for a month's servers roster. Pure: no I/O, no clock, no database.
//
// Input
//   month    'YYYY-MM'
//   roles    [{ id, name, slots, period: 'weekly' | 'monthly', eligible: [personId, ...] }]
//            `eligible` is the role's serving group. Its order is the tie-break order.
//   away     [{ person, date: 'YYYY-MM-DD' }]
//   history  [{ role: roleId, person, date: 'YYYY-MM-DD' }]   past rosters
//
// Output
//   { assignments, warnings }
//   assignments  [{ role, date, slot, person }]. `date` is the Sunday for weekly roles and
//                null for monthly roles. `person` is null when the slot could not be filled.
//   warnings     [{ type: 'double-booked' | 'short-pool', role, date, person?, message }]
//
// Rules
//   1. Each slot goes to the eligible person who has gone longest since last serving in
//      that role. Anyone who never has comes first. History and slots already filled in
//      this run both count.
//   2. Ties are broken by the person's position in the role's `eligible` list.
//   3. Away: a weekly slot skips anyone away on that Sunday. A monthly role skips anyone
//      away on 2 or more of the month's Sundays (a single missed Sunday is left to the
//      coordinator to swap).
//   4. Nobody holds two roles on one Sunday unless the pool is too small. Then the slot is
//      filled anyway and a 'double-booked' warning names the role. A monthly role covers
//      every Sunday of the month for this rule.
//   5. If nobody is left, the slot stays empty (person null) with a 'short-pool' warning.
//   6. Nobody fills the same role twice on one date.
//
// Order of work: monthly roles first (they hold every Sunday), then weekly roles in the
// order given; within a role Sunday by Sunday, slot by slot. The result is deterministic.

export const AWAY_MONTHLY_THRESHOLD = 2;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function sundaysOf(month) {
  const m = MONTH_RE.exec(month);
  if (!m) throw new RangeError(`month must be YYYY-MM, got ${JSON.stringify(month)}`);
  const year = Number(m[1]);
  const mon = Number(m[2]) - 1;
  const sundays = [];
  const d = new Date(Date.UTC(year, mon, 1));
  while (d.getUTCMonth() === mon) {
    if (d.getUTCDay() === 0) sundays.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return sundays;
}

function checkRole(role) {
  if (!Number.isInteger(role.slots) || role.slots < 0) {
    throw new RangeError(`role ${role.id}: slots must be a non-negative integer`);
  }
  if (role.period !== 'weekly' && role.period !== 'monthly') {
    throw new RangeError(`role ${role.id}: period must be 'weekly' or 'monthly'`);
  }
}

export function suggestRoster({ month, roles, away = [], history = [] }) {
  const sundays = sundaysOf(month);
  roles.forEach(checkRole);

  const awayByPerson = new Map();
  for (const { person, date } of away) {
    if (!awayByPerson.has(person)) awayByPerson.set(person, new Set());
    awayByPerson.get(person).add(date);
  }
  const isAway = (person, date) => awayByPerson.get(person)?.has(date) ?? false;
  const awayCount = (person) => sundays.filter((s) => isAway(person, s)).length;

  // lastServed.get(roleId).get(person) -> latest ISO date; absent means never.
  const lastServed = new Map();
  const noteServed = (role, person, date) => {
    if (!lastServed.has(role)) lastServed.set(role, new Map());
    const byPerson = lastServed.get(role);
    if (!(byPerson.get(person) >= date)) byPerson.set(person, date);
  };
  for (const h of history) noteServed(h.role, h.person, h.date);

  // busy.get(person) -> Set of Sundays already holding a role in this run.
  const busy = new Map();
  const markBusy = (person, dates) => {
    if (!busy.has(person)) busy.set(person, new Set());
    for (const d of dates) busy.get(person).add(d);
  };
  const isBusy = (person, dates) => dates.some((d) => busy.get(person)?.has(d));

  const assignments = [];
  const warnings = [];

  const ordered = [
    ...roles.filter((r) => r.period === 'monthly'),
    ...roles.filter((r) => r.period === 'weekly'),
  ];

  for (const role of ordered) {
    const monthly = role.period === 'monthly';
    // Monthly roles occupy every Sunday and are away-checked over the whole month.
    const dates = monthly ? [null] : sundays;
    const occupies = (date) => (monthly ? sundays : [date]);
    const available = (person, date) =>
      monthly ? awayCount(person) < AWAY_MONTHLY_THRESHOLD : !isAway(person, date);
    const servedDate = monthly ? sundays[sundays.length - 1] : null;

    for (const date of dates) {
      const placed = new Set();
      for (let slot = 1; slot <= role.slots; slot++) {
        const pool = role.eligible
          .map((person, order) => ({ person, order }))
          .filter(({ person }) => !placed.has(person) && available(person, date));

        const free = pool.filter(({ person }) => !isBusy(person, occupies(date)));
        const candidates = free.length > 0 ? free : pool;

        if (candidates.length === 0) {
          assignments.push({ role: role.id, date, slot, person: null });
          warnings.push({
            type: 'short-pool',
            role: role.id,
            date,
            message: `${role.name}: no one available for slot ${slot}${when(date, month)}; left empty.`,
          });
          continue;
        }

        const last = lastServed.get(role.id);
        candidates.sort((a, b) => {
          const la = last?.get(a.person);
          const lb = last?.get(b.person);
          if (la !== lb) {
            if (la === undefined) return -1;
            if (lb === undefined) return 1;
            return la < lb ? -1 : 1;
          }
          return a.order - b.order;
        });
        const { person } = candidates[0];

        if (free.length === 0) {
          warnings.push({
            type: 'double-booked',
            role: role.id,
            date,
            person,
            message: `${role.name}: ${person} is also serving another role${when(date, month)}; the pool is too small.`,
          });
        }

        placed.add(person);
        markBusy(person, occupies(date));
        noteServed(role.id, person, monthly ? servedDate : date);
        assignments.push({ role: role.id, date, slot, person });
      }
    }
  }

  return { assignments, warnings };
}

function when(date, month) {
  return date === null ? ` in ${month}` : ` on ${date}`;
}
