// The weekly tasks list's rules that need no database or Apostrophe: checking
// what the office types, and the shapes the screens and the reminder mail use.
// Date and reminder rules are not here: they are in packages/tasks-logic.
const crypto = require('node:crypto');
const { WEEKDAYS, TIME_ZONE } = require('@church-system/tasks-logic');

const MAX_TITLE = 200;

// What the template starts with. The days are the spec's (Friday, Saturday);
// "check the coming week's events" has no day in the spec, Wednesday is ours.
const DEFAULT_TEMPLATE = [
  {
    key: 'build-bulletin',
    title: 'Build the bulletin',
    day: 'friday',
    owner: null
  },
  {
    key: 'print-bulletin',
    title: 'Print the bulletin',
    day: 'saturday',
    owner: null
  },
  {
    key: 'check-events',
    title: 'Check the coming week\'s events',
    day: 'wednesday',
    owner: null
  }
];

function invalid(message) {
  const error = new Error(message);
  error.name = 'invalid';
  return error;
}

function cleanTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title) {
    throw invalid('Give the task a title.');
  }
  if (title.length > MAX_TITLE) {
    throw invalid(`Keep the title under ${MAX_TITLE} characters.`);
  }
  return title;
}

function cleanDay(value) {
  if (value == null || value === '') {
    return null;
  }
  const day = String(value).toLowerCase();
  if (!WEEKDAYS.includes(day)) {
    throw invalid('That is not a day of the week.');
  }
  return day;
}

function cleanOwner(value) {
  return typeof value === 'string' && value ? value : null;
}

// The template as the office typed it: [{ key?, title, day, owner }]. A row
// with no key is new and gets one; a kept row keeps its key.
function cleanTemplate(rows) {
  if (!Array.isArray(rows)) {
    throw invalid('Send the template as a list.');
  }
  if (rows.length > 100) {
    throw invalid('That is too many template items.');
  }
  const seen = new Set();
  return rows.map(row => {
    const key = typeof row.key === 'string' && /^[\w-]{1,40}$/.test(row.key)
      ? row.key
      : `t-${crypto.randomBytes(4).toString('hex')}`;
    if (seen.has(key)) {
      throw invalid('Two template items share a key.');
    }
    seen.add(key);
    return {
      key,
      title: cleanTitle(row.title),
      day: cleanDay(row.day),
      owner: cleanOwner(row.owner)
    };
  });
}

// A hand-added item, in the logic package's item shape.
function newOneOff(weekStart, dueDate, fields) {
  return {
    id: `${weekStart}:one-off:${crypto.randomBytes(4).toString('hex')}`,
    title: cleanTitle(fields.title),
    kind: 'one-off',
    owner: cleanOwner(fields.owner),
    dueDate,
    fromLastWeek: false,
    sourceKey: null,
    done: false,
    doneBy: null,
    doneAt: null,
    resolvedBySystem: false
  };
}

// What changed between two lists of items, for the audit trail:
// [{ field: 'item:<id>', old, new }].
function itemChanges(before, after) {
  const was = new Map(before.map(item => [ item.id, item ]));
  const now = new Map(after.map(item => [ item.id, item ]));
  const changes = [];
  for (const id of new Set([ ...was.keys(), ...now.keys() ])) {
    if (JSON.stringify(was.get(id)) !== JSON.stringify(now.get(id))) {
      changes.push({
        field: `item:${id}`,
        old: was.get(id) || null,
        new: now.get(id) || null
      });
    }
  }
  return changes;
}

// The hour (0-23) in the church's time zone, for "is it past 07:00 yet".
const hourFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23'
});

function chicagoHour(instant) {
  return Number(hourFormat.format(instant));
}

const stampFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short'
});

function stamp(iso) {
  return iso ? stampFormat.format(new Date(iso)) : '';
}

module.exports = {
  DEFAULT_TEMPLATE,
  chicagoHour,
  cleanDay,
  cleanOwner,
  cleanTemplate,
  cleanTitle,
  itemChanges,
  newOneOff,
  stamp
};
