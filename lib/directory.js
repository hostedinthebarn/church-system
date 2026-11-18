// What the directory shows, as plain functions over plain records, with no
// database and no Apostrophe (LGC-46). The rules come from poc-data-model.md:
// what a member, a household member and the office may see; the A-Z order;
// search; relationships; and what the household edit form may change.
//
// A "snapshot" is { households, people, relationships, groups }, the stored
// records. A "viewer" is { role: 'admin' | 'guest', householdId, isAdult }.
const rules = require('./rules.js');

const HIDEABLE = [ 'email', 'cellphone', 'address' ];
const STATUSES = [ 'member', 'regular', 'visitor' ];
const INACTIVE_REASONS = [ 'deceased', 'moved', 'left' ];
const MAX = 200;

// The signed-in person who is anyone's neighbour in the pew: a member with no
// household of their own to look at, such as the PDF's reader.
const GENERIC_MEMBER = Object.freeze({
  role: 'guest',
  householdId: null,
  isAdult: true
});

function fold(text) {
  return String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function surname(household) {
  return String(household.title || '').split(',')[0].trim();
}

function fullName(person) {
  return `${person.preferredName || person.firstName} ${person.lastName}`.trim();
}

// Listed people: members and regular attenders who are still active.
function isListed(person) {
  return !rules.isInactive(person) && person.status !== 'visitor';
}

function byHouseholdName(a, b) {
  return surname(a).localeCompare(surname(b), 'en') ||
    String(a.title).localeCompare(String(b.title), 'en');
}

// Adults first, then by age, so a household reads parents then children.
function byRole(today) {
  return (a, b) => Number(rules.isMinor(a.dateOfBirth, today)) - Number(rules.isMinor(b.dateOfBirth, today)) ||
    String(a.dateOfBirth).localeCompare(String(b.dateOfBirth)) ||
    String(a.firstName).localeCompare(String(b.firstName));
}

function index(records) {
  return new Map(records.map(record => [ record._id, record ]));
}

function householdOf(person) {
  return (person.householdIds || [])[0] || null;
}

function peopleByHousehold(people) {
  const map = new Map();
  for (const person of people) {
    const id = householdOf(person);
    if (!map.has(id)) {
      map.set(id, []);
    }
    map.get(id).push(person);
  }
  return map;
}

// Whether `viewer` may open this household at all.
function canSeeHousehold(viewer, household, members) {
  if (!viewer) {
    return false;
  }
  if (rules.isOffice(viewer) || viewer.householdId === household._id) {
    return true;
  }
  return !household.directoryOptOut && members.some(isListed);
}

// The address as one line, or '' when there is none.
function addressLine(household) {
  const address = household.address || {};
  const cityLine = [ address.city, [ address.state, address.zip ].filter(Boolean).join(' ') ]
    .filter(Boolean).join(', ');
  return [ address.street, cityLine ].filter(Boolean).join(', ');
}

// Another member sees the address only if no listed adult has hidden it.
function addressVisible(viewer, household, members, today = rules.todayIso()) {
  if (rules.isOffice(viewer) || viewer.householdId === household._id) {
    return true;
  }
  return !members
    .filter(person => isListed(person) && !rules.isMinor(person.dateOfBirth, today))
    .some(person => (person.hiddenFields || []).includes('address'));
}

// The household's phone for a list row: the landline, else the first adult's
// cellphone that they have not hidden.
function listPhone(household, adultsShown) {
  if (household.homePhone) {
    return household.homePhone;
  }
  const adult = adultsShown.find(person => person.cellphone);
  return adult ? adult.cellphone : '';
}

// ---------- relationships ----------

// For each person, what to say about their relatives: stored links, and the
// siblings, grandparents and grandchildren worked out from them.
function relationsFor(personId, relationships, peopleById) {
  const links = relationships.filter(link => peopleById.has((link.personAIds || [])[0]) &&
    peopleById.has((link.personBIds || [])[0]));
  const a = link => link.personAIds[0];
  const b = link => link.personBIds[0];
  const out = [];
  const add = (kind, otherId, extra = {}) => {
    if (otherId !== personId && !out.some(item => item.kind === kind && item.otherId === otherId)) {
      out.push({
        kind,
        otherId,
        derived: false,
        anniversary: null,
        deceased: false,
        ...extra
      });
    }
  };
  const parentsOf = id => links.filter(link => link.kind === 'parent-child' && b(link) === id).map(a);
  const childrenOf = id => links.filter(link => link.kind === 'parent-child' && a(link) === id).map(b);
  for (const link of links) {
    const deceased = rules.relationshipDeceased([ peopleById.get(a(link)), peopleById.get(b(link)) ]);
    if (link.kind === 'spouse' && (a(link) === personId || b(link) === personId)) {
      add('spouse', a(link) === personId ? b(link) : a(link), {
        anniversary: link.anniversary || null,
        deceased
      });
    } else if (link.kind === 'parent-child') {
      if (a(link) === personId) {
        add('parentOf', b(link), { deceased });
      } else if (b(link) === personId) {
        add('childOf', a(link), { deceased });
      }
    } else if (link.kind === 'guardian') {
      if (a(link) === personId) {
        add('guardianOf', b(link), { deceased });
      } else if (b(link) === personId) {
        add('wardOf', a(link), { deceased });
      }
    }
  }
  const parents = parentsOf(personId);
  for (const parent of parents) {
    for (const sibling of childrenOf(parent)) {
      add('siblingOf', sibling, { derived: true });
    }
    for (const grandparent of parentsOf(parent)) {
      add('grandchildOf', grandparent, { derived: true });
    }
  }
  for (const child of childrenOf(personId)) {
    for (const grandchild of childrenOf(child)) {
      add('grandparentOf', grandchild, { derived: true });
    }
  }
  return out;
}

// ---------- the household page ----------

// One person as `viewer` may see them. Returns null when nothing may be seen.
function personView({
  viewer, person, household, today, relationships, peopleById, householdsById, groups, visible
}) {
  const office = rules.isOffice(viewer);
  const own = viewer && viewer.householdId === household._id;
  const raw = rules.viewPerson({
    viewer,
    person,
    household,
    today
  });
  if (!raw) {
    return null;
  }
  const minor = rules.isMinor(person.dateOfBirth, today);
  const deceased = person.inactiveReason === 'deceased';
  const hidden = person.hiddenFields || [];
  const view = {
    id: person._id,
    name: fullName(person),
    // The legal first name, when the person goes by another.
    firstName: person.preferredName ? person.firstName : '',
    minor,
    birthday: raw.birthday,
    email: raw.email || '',
    cellphone: raw.cellphone || '',
    baptismDate: raw.baptismDate || '',
    hiddenFromMembers: (office || own) && !minor
      ? hidden.filter(field => [ 'email', 'cellphone' ].includes(field))
      : [],
    onlyYourHousehold: Boolean(own && !office && minor && (person.email || person.cellphone)),
    inactiveReason: office ? person.inactiveReason || '' : '',
    deceased: office && deceased,
    status: office ? person.status || 'member' : '',
    dateOfBirth: office ? person.dateOfBirth : '',
    age: office ? rules.ageOn(person.dateOfBirth, today) : null,
    turnsEighteen: Boolean(office && minor && rules.ageOn(person.dateOfBirth, today) === 17),
    baptismHidden: Boolean(office && person.baptismDate && !person.showBaptism),
    relations: [],
    groups: []
  };
  // A household's own people, and the office, see their email and cellphone
  // whether hidden or not (a minor's included).
  if (office || own) {
    view.email = person.email || '';
    view.cellphone = person.cellphone || '';
    if (own && !office && person.showBaptism && person.baptismDate) {
      view.baptismDate = person.baptismDate;
    }
    if (office) {
      view.baptismDate = person.baptismDate || '';
    }
  }
  for (const relation of relationsFor(person._id, relationships, peopleById)) {
    const other = peopleById.get(relation.otherId);
    if (!other || !visible(other)) {
      continue;
    }
    const otherHousehold = householdsById.get(householdOf(other));
    view.relations.push({
      kind: relation.kind,
      name: fullName(other),
      derived: relation.derived,
      deceased: relation.deceased,
      // The wedding date goes when either spouse has died, except for the
      // office.
      anniversary: !relation.deceased || office ? relation.anniversary : null,
      householdId: otherHousehold ? otherHousehold._id : null,
      otherHousehold: otherHousehold && otherHousehold._id !== household._id
        ? surname(otherHousehold)
        : ''
    });
  }
  view.groups = groups
    .filter(group => (group.membersIds || []).includes(person._id))
    .map(group => group.title)
    .sort((x, y) => x.localeCompare(y, 'en'));
  return view;
}

// The household page for `viewer`, or null when they may not open it.
function householdView({
  viewer, household, snapshot, today = rules.todayIso()
}) {
  const people = (peopleByHousehold(snapshot.people).get(household._id) || []).slice().sort(byRole(today));
  if (!canSeeHousehold(viewer, household, people)) {
    return null;
  }
  const office = rules.isOffice(viewer);
  const own = viewer.householdId === household._id;
  const peopleById = index(snapshot.people);
  const householdsById = index(snapshot.households);
  const visible = person => {
    const home = householdsById.get(householdOf(person));
    return Boolean(rules.viewPerson({
      viewer,
      person,
      household: home,
      today
    }));
  };
  const shown = [];
  for (const person of people) {
    const view = personView({
      viewer,
      person,
      household,
      today,
      relationships: snapshot.relationships,
      peopleById,
      householdsById,
      groups: snapshot.groups,
      visible
    });
    // Members see their own household's people only while active; the office
    // also sees the inactive and visitors.
    if (view && (office || isListed(person) || (own && !rules.isInactive(person)))) {
      shown.push(view);
    }
  }
  const hiddenAddress = people.some(person => !rules.isMinor(person.dateOfBirth, today) &&
    (person.hiddenFields || []).includes('address'));
  const showAddress = addressVisible(viewer, household, people, today);
  return {
    id: household._id,
    name: household.title,
    surname: surname(household),
    own,
    office,
    optOut: Boolean(household.directoryOptOut),
    noAdults: !people.some(person => isListed(person) && !rules.isMinor(person.dateOfBirth, today)),
    address: showAddress ? addressLine(household) : '',
    addressHidden: hiddenAddress && (office || own),
    homePhone: household.homePhone || '',
    people: shown,
    canEdit: rules.canEditHousehold(viewer, household._id) &&
      (office || shown.some(person => !person.minor)),
    photoId: (household.photoIds || [])[0] || null
  };
}

// ---------- the browse list and search ----------

// Rows for the A-Z list and the search. `include` (office only) adds
// { inactive, visitors, optedOut } households that members never see.
function directoryRows({
  viewer, snapshot, query = '', include = {}, today = rules.todayIso()
}) {
  const byHousehold = peopleByHousehold(snapshot.people);
  const office = rules.isOffice(viewer);
  const terms = fold(query).split(/\s+/).filter(Boolean);
  const rows = [];
  for (const household of snapshot.households.slice().sort(byHouseholdName)) {
    const all = (byHousehold.get(household._id) || []).slice().sort(byRole(today));
    const listedPeople = all.filter(isListed);
    const own = viewer.householdId === household._id;
    const flags = [];
    if (household.directoryOptOut) {
      flags.push('optedOut');
    }
    if (!listedPeople.length) {
      flags.push(all.some(person => !rules.isInactive(person)) ? 'visitor' : 'inactive');
    }
    const listed = !flags.length;
    if (!listed) {
      const wanted = office && flags.some(name => ({
        optedOut: include.optedOut,
        visitor: include.visitors,
        inactive: include.inactive
      })[name]);
      // A household that has opted out still finds itself in its own list.
      const mine = own && flags.every(name => name === 'optedOut');
      if (!wanted && !mine) {
        continue;
      }
    }
    const people = office ? all : all.filter(person => isListed(person) || (own && !rules.isInactive(person)));
    const seen = people.filter(person => rules.viewPerson({
      viewer,
      person,
      household,
      today
    }));
    const adultsShown = seen.filter(person => !rules.isMinor(person.dateOfBirth, today) &&
      (office || own || !(person.hiddenFields || []).includes('cellphone')));
    const showAddress = addressVisible(viewer, household, all, today);
    const address = showAddress ? household.address || {} : {};
    const haystack = fold([
      household.title,
      ...seen.map(person => `${person.firstName} ${person.preferredName || ''} ${person.lastName}`),
      address.city || '',
      address.street || '',
      listPhone(household, adultsShown)
    ].join(' '));
    if (terms.length && !terms.every(term => haystack.includes(term))) {
      continue;
    }
    rows.push({
      id: household._id,
      name: household.title,
      surname: surname(household),
      letter: (fold(surname(household))[0] || '#').toUpperCase(),
      people: seen.map(person => ({
        id: person._id,
        name: fullName(person),
        minor: rules.isMinor(person.dateOfBirth, today)
      })),
      address: showAddress ? addressLine(household) : '',
      city: showAddress && address.city ? address.city : '',
      phone: listPhone(household, adultsShown),
      flags: office || own ? flags : [],
      photoId: (household.photoIds || [])[0] || null
    });
  }
  return rows;
}

function groupByLetter(rows) {
  const letters = new Map();
  for (const row of rows) {
    if (!letters.has(row.letter)) {
      letters.set(row.letter, []);
    }
    letters.get(row.letter).push(row);
  }
  return [ ...letters.entries() ].map(([ letter, items ]) => ({
    letter,
    rows: items
  }));
}

// ---------- the PDF ----------

// What the Download PDF holds: every listed household in surname order, as
// another member would see it. So hidden fields, a minor's email and
// cellphone, opt-outs, visitors and inactive people are all left out; the
// office gets the same PDF as members. Adults' birthdays are an option
// (`adultBirthdays`) because the church has not decided.
function pdfEntries({
  snapshot, adultBirthdays = true, today = rules.todayIso()
}) {
  const entries = [];
  for (const household of snapshot.households.slice().sort(byHouseholdName)) {
    const view = householdView({
      viewer: GENERIC_MEMBER,
      household,
      snapshot,
      today
    });
    if (!view || view.optOut) {
      continue;
    }
    const people = view.people;
    if (!people.length) {
      continue;
    }
    const adults = people.filter(person => !person.minor);
    const children = people.filter(person => person.minor);
    const adultIds = new Set(adults.map(person => person.id));
    const idsByName = new Map(adults.map(person => [ person.name, person.id ]));
    let anniversary = null;
    for (const person of adults) {
      const spouse = person.relations.find(relation => relation.kind === 'spouse' &&
        relation.anniversary && idsByName.has(relation.name) && adultIds.has(idsByName.get(relation.name)));
      if (spouse) {
        anniversary = spouse.anniversary;
      }
    }
    entries.push({
      name: view.name,
      surname: view.surname,
      address: view.address,
      homePhone: view.homePhone,
      adults: adults.map(person => ({
        name: person.name,
        birthday: adultBirthdays ? person.birthday : null,
        cellphone: person.cellphone,
        email: person.email
      })),
      anniversary,
      children: children.map(person => ({
        name: person.name,
        birthday: person.birthday
      }))
    });
  }
  return entries;
}

// ---------- the edit form ----------

function cleanText(value, max = MAX) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function validDate(value, today) {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!parsed) {
    return false;
  }
  const date = new Date(Date.UTC(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3])));
  return date.toISOString().slice(0, 10) === value && value <= today && value >= '1880-01-01';
}

function looksLikeEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function flag(body, key) {
  return body[key] === 'on' || body[key] === '1' || body[key] === 'true';
}

// Reads the submitted form into a patch for the household and for each of its
// people. Only people who are in the household can be changed; the office-only
// fields are read only for the office. Returns { household, people, errors }
// where errors are [{ key, field }] for the form to show.
function parseHouseholdEdit({
  body, household, people, office, today = rules.todayIso()
}) {
  const errors = [];
  const fail = (key, field = '') => errors.push({
    key,
    field
  });
  const patch = {
    household: {},
    people: []
  };
  const text = name => cleanText(body[name]);
  patch.household.address = {
    street: text('street'),
    city: text('city'),
    state: text('state'),
    zip: text('zip')
  };
  patch.household.homePhone = cleanText(body.homePhone, 40);
  patch.household.directoryOptOut = flag(body, 'directoryOptOut');
  if (office) {
    const title = text('title');
    if (!title) {
      fail('errorNameRequired', 'title');
    }
    patch.household.title = title;
    patch.household.autoName = flag(body, 'autoName');
  }
  for (const person of people) {
    const prefix = `p.${person._id}.`;
    if (body[`${prefix}firstName`] === undefined) {
      continue;
    }
    const minor = rules.isMinor(person.dateOfBirth, today);
    const change = {
      id: person._id,
      set: {}
    };
    const field = name => `${prefix}${name}`;
    const firstName = cleanText(body[field('firstName')]);
    const lastName = cleanText(body[field('lastName')]);
    if (!firstName) {
      fail('errorFirstNameRequired', field('firstName'));
    }
    if (!lastName) {
      fail('errorLastNameRequired', field('lastName'));
    }
    const dob = cleanText(body[field('dateOfBirth')], 10);
    if (!validDate(dob, today)) {
      fail('errorDateOfBirth', field('dateOfBirth'));
    }
    const email = cleanText(body[field('email')], 254).toLowerCase();
    if (email && !looksLikeEmail(email)) {
      fail('errorEmail', field('email'));
    }
    Object.assign(change.set, {
      firstName,
      lastName,
      preferredName: cleanText(body[field('preferredName')]),
      dateOfBirth: dob,
      email,
      cellphone: cleanText(body[field('cellphone')], 40)
    });
    if (!minor) {
      change.set.hiddenFields = HIDEABLE.filter(name => flag(body, field(`hide.${name}`)));
    }
    if (office) {
      const status = text(field('status'));
      change.set.status = STATUSES.includes(status) ? status : person.status || 'member';
      const reason = text(field('inactiveReason'));
      change.set.inactiveReason = INACTIVE_REASONS.includes(reason) ? reason : '';
    }
    patch.people.push(change);
  }
  patch.errors = errors;
  return patch;
}

// Only what actually changed, so a save with no changes writes nothing.
function changedFields(before, set) {
  const changed = {};
  for (const [ key, value ] of Object.entries(set)) {
    const old = before[key] === undefined || before[key] === null ? (Array.isArray(value) ? [] : '') : before[key];
    if (JSON.stringify(old) !== JSON.stringify(value)) {
      changed[key] = value;
    }
  }
  return changed;
}

// A value from the change history, as text for the page.
function formatChangeValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value).slice(0, 300);
}

module.exports = {
  GENERIC_MEMBER,
  HIDEABLE,
  addressLine,
  canSeeHousehold,
  changedFields,
  directoryRows,
  fold,
  formatChangeValue,
  fullName,
  groupByLetter,
  householdIdOf: householdOf,
  householdView,
  isListed,
  parseHouseholdEdit,
  pdfEntries,
  relationsFor,
  surname
};
