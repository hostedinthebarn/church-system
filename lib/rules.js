// The church system's data rules as plain functions, with no database and no
// Apostrophe, so they can be tested fast and read on their own. The rules come
// from poc-data-model.md (LGC-12). Dates are 'YYYY-MM-DD' strings, as
// Apostrophe's date fields store them.

const FORGOTTEN = '[deleted at request]';

// Bookkeeping Apostrophe changes on every save; never worth an audit entry or
// a "this note was edited" error.
const BOOKKEEPING = [
  'updatedAt', 'updatedBy', 'cacheInvalidatedAt', 'createdAt', 'modified',
  'lastPublishedAt', 'aposLastTargetId', 'aposLastPublishedAt', 'archivedAt',
  // Derived by Apostrophe from the real fields
  'highSearchText', 'highSearchWords', 'lowSearchText', 'searchSummary',
  'titleSortified', 'metaType', 'aposDocId'
];

// A record as it is stored: without the temporary `_relationship` copies, and
// without the `...Fields` extras Apostrophe adds when it loads a relationship.
function storedFields(doc) {
  if (!doc) {
    return null;
  }
  return Object.fromEntries(Object.entries(doc).filter(([ key ]) =>
    (!key.startsWith('_') || key === '_id') && !key.endsWith('Fields')));
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

// Whole years old on `today`, or null without a usable date of birth.
function ageOn(dateOfBirth, today) {
  const born = parseDate(dateOfBirth);
  const now = parseDate(today);
  if (!born || !now) {
    return null;
  }
  const birthdayPassed = now.month > born.month ||
    (now.month === born.month && now.day >= born.day);
  return now.year - born.year - (birthdayPassed ? 0 : 1);
}

// Never stored: worked out from the date of birth each time. With no date of
// birth we can't say, and treating the person as a minor is the safe side.
function isMinor(dateOfBirth, today) {
  const age = ageOn(dateOfBirth, today);
  return age === null ? true : age < 18;
}

// People who were minors on `from` and are adults on `to`: the office's
// "now an adult" prompt.
function becameAdult(people, from, to) {
  return people.filter(person => isMinor(person.dateOfBirth, from) &&
    !isMinor(person.dateOfBirth, to));
}

function isInactive(person) {
  return Boolean(person.inactiveReason);
}

function shortName(person) {
  return person.preferredName || person.firstName;
}

// "Bailey, Gary & Shannon"; "Smith, Jo & Lee Jones". Adults first; a
// household with no adults is named from whoever is in it. The office can edit
// the result, so this only suggests.
function householdName(people, today = todayIso()) {
  const listed = people.filter(person => !isInactive(person));
  const adults = listed.filter(person => !isMinor(person.dateOfBirth, today));
  const named = adults.length ? adults : listed;
  if (!named.length) {
    return '';
  }
  const surname = named[0].lastName;
  const parts = named.map((person, index) => {
    if (index === 0 || person.lastName === surname) {
      return shortName(person);
    }
    return `${shortName(person)} ${person.lastName}`;
  });
  const joined = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
  return `${surname}, ${joined}`;
}

function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// What changed between two versions of a record: [{ field, old, new }].
// Fields in `ignore` (timestamps and the like) are skipped.
function diffFields(before, after, ignore = []) {
  const skip = new Set(ignore);
  const names = new Set([ ...Object.keys(before || {}), ...Object.keys(after || {}) ]);
  const changes = [];
  for (const field of [ ...names ].sort()) {
    if (skip.has(field)) {
      continue;
    }
    const oldValue = before ? before[field] : undefined;
    const newValue = after ? after[field] : undefined;
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({
        field,
        old: oldValue === undefined ? null : oldValue,
        new: newValue === undefined ? null : newValue
      });
    }
  }
  return changes;
}

// After a forget request the trail keeps who, when and which record, but not
// what the values were.
function redactEntry(entry) {
  return {
    ...entry,
    changes: (entry.changes || []).map(change => ({
      field: change.field,
      old: change.old === null ? null : FORGOTTEN,
      new: change.new === null ? null : FORGOTTEN
    })),
    redacted: true
  };
}

// Office notes are add-only. The one allowed change to a saved note is
// striking it through (or un-striking it).
function noteChangeAllowed(before, after) {
  const changed = diffFields(before, after, [ 'struck', ...BOOKKEEPING ]);
  return changed.length === 0;
}

// Days since the latest note ticked as a contact, or null if never.
function daysSinceContact(notes, today) {
  const dates = notes
    .filter(note => note.contacted && !note.struck && parseDate(note.contactDate))
    .map(note => note.contactDate)
    .sort();
  if (!dates.length) {
    return null;
  }
  const last = parseDate(dates[dates.length - 1]);
  const now = parseDate(today);
  const dayNumber = ({
    year, month, day
  }) => Date.UTC(year, month - 1, day) / 86400000;
  return Math.max(0, dayNumber(now) - dayNumber(last));
}

function isOffice(viewer) {
  return Boolean(viewer) && viewer.role === 'admin';
}

// Members edit only their own household; the office edits any. Who counts as
// "in the household" is the viewer's own person record, checked by the caller
// (an adult with a login).
function canEditHousehold(viewer, householdId) {
  if (!viewer) {
    return false;
  }
  if (isOffice(viewer)) {
    return true;
  }
  return Boolean(householdId) && viewer.householdId === householdId && viewer.isAdult === true;
}

// What `viewer` may see of `person`, or null when nothing. `household` is the
// person's household. Office sees everything; a member sees their own
// household in full except the office-only fields; everyone else sees only
// what the person has not hidden, minors by name and birthday alone.
const OFFICE_ONLY = [ 'status', 'inactiveReason', 'dateOfBirth' ];

function viewPerson({
  viewer, person, household, today
}) {
  if (isOffice(viewer)) {
    return {
      ...person,
      minor: isMinor(person.dateOfBirth, today)
    };
  }
  if (!viewer) {
    return null;
  }
  const minor = isMinor(person.dateOfBirth, today);
  const sameHousehold = Boolean(household) && viewer.householdId === household._id;
  const view = {
    firstName: person.firstName,
    lastName: person.lastName,
    preferredName: person.preferredName || '',
    birthday: person.inactiveReason === 'deceased' ? null : birthday(person.dateOfBirth),
    minor
  };
  if (sameHousehold) {
    for (const [ key, value ] of Object.entries(person)) {
      if (!OFFICE_ONLY.includes(key) && !(key in view)) {
        view[key] = value;
      }
    }
    return view;
  }
  if (isInactive(person) || person.status === 'visitor') {
    return null;
  }
  if (household && household.directoryOptOut) {
    return null;
  }
  if (minor) {
    return view;
  }
  const hidden = person.hiddenFields || [];
  if (person.email && !hidden.includes('email')) {
    view.email = person.email;
  }
  if (person.cellphone && !hidden.includes('cellphone')) {
    view.cellphone = person.cellphone;
  }
  if (household && !hidden.includes('address')) {
    view.address = household.address || null;
  }
  if (person.showBaptism && person.baptismDate) {
    view.baptismDate = person.baptismDate;
  }
  return view;
}

// 'MM-DD' for a birthday, or null when there is no date.
function birthday(dateOfBirth) {
  const parsed = parseDate(dateOfBirth);
  if (!parsed) {
    return null;
  }
  return `${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
}

// A relationship is marked deceased when either person has died.
function relationshipDeceased(people) {
  return people.some(person => person && person.inactiveReason === 'deceased');
}

module.exports = {
  BOOKKEEPING,
  FORGOTTEN,
  ageOn,
  becameAdult,
  birthday,
  canEditHousehold,
  daysSinceContact,
  diffFields,
  householdName,
  isInactive,
  isMinor,
  noteChangeAllowed,
  redactEntry,
  storedFields,
  relationshipDeceased,
  todayIso,
  viewPerson
};
