// The bulletin's sections, in one place (LGC-61). Each has a panel, an order
// within it, where its content comes from, and two switches: `print` (on the
// folded sheet) and `website` (on the public web page). The church changes
// the switches here; nothing else in the code needs to know.
//
// source: 'hand' typed per bulletin | 'standing' set once, edited by the
// office | 'events' from the calendar | 'roster' from the servers roster |
// 'directory' birthdays and anniversaries from the directory.
//
// The prayer list is off the website by default: it carries health detail
// (LGC-62 decides later). Birthdays and anniversaries are off everywhere: the
// real bulletin doesn't carry them (Gary, 2026-11-16).

export const SECTIONS = [
  {
    id: 'prayer',
    title: 'Prayer List',
    panel: 'flap',
    order: 1,
    source: 'hand',
    print: true,
    website: false,
    fields: [
      { key: 'prayerRequests', label: 'Prayer requests' },
      { key: 'continuePraying', label: 'Continue to pray for', heading: 'Continue to pray for' },
      { key: 'shutIns', label: 'Shut-ins', heading: 'Shut-ins' },
      { key: 'military', label: 'Military', heading: 'Military' }
    ]
  },
  { id: 'leadership', title: 'Leadership', panel: 'back', order: 1, source: 'standing', print: true, website: true },
  { id: 'servantLeaders', title: 'Servant Leaders', panel: 'back', order: 2, source: 'standing', print: true, website: true },
  { id: 'contact', title: 'Contact Us', panel: 'back', order: 3, source: 'standing', print: true, website: true },
  { id: 'serviceTimes', title: 'Service Times', panel: 'back', order: 4, source: 'standing', print: true, website: true },
  {
    id: 'cover',
    title: 'Welcome!',
    panel: 'cover',
    order: 1,
    source: 'hand',
    print: true,
    website: true,
    fields: [ { key: 'devotional', label: 'Devotional' } ]
  },
  {
    id: 'announcements',
    title: 'Announcements',
    panel: 'left',
    order: 1,
    source: 'hand',
    print: true,
    website: true,
    fields: [ { key: 'announcements', label: 'Announcements' } ]
  },
  { id: 'coffee', title: 'Coffee with the Minister', panel: 'left', order: 2, source: 'standing', print: true, website: true },
  {
    id: 'figures',
    title: 'Last Sunday',
    panel: 'left',
    order: 3,
    source: 'hand',
    print: true,
    website: true,
    fields: [
      {
        key: 'figuresDate',
        label: 'Date the figures are for',
        type: 'date'
      },
      { key: 'figures', label: 'Attendance and giving figures' }
    ]
  },
  { id: 'birthdays', title: 'Birthdays and Anniversaries', panel: 'left', order: 4, source: 'directory', print: false, website: false },
  { id: 'calendar', title: 'Mark Your Calendar', panel: 'middle', order: 1, source: 'events', print: true, website: true },
  { id: 'missions', title: 'Missions', panel: 'middle', order: 2, source: 'standing', print: true, website: true },
  { id: 'benevolence', title: 'Benevolence', panel: 'middle', order: 3, source: 'standing', print: true, website: true },
  { id: 'serving', title: 'Those Serving', panel: 'right', order: 1, source: 'roster', print: true, website: true },
  { id: 'serveCall', title: 'If You Can\'t Serve', panel: 'right', order: 2, source: 'standing', print: true, website: true }
];

// The serving roles, in print order. `slots` is how many names a Sunday has.
export const SERVING_ROLES = [
  { role: 'announcements', label: 'Announcements', slots: 1 },
  { role: 'openingPrayer', label: 'Opening prayer', slots: 1 },
  { role: 'songLeader', label: 'Song leader', slots: 1 },
  { role: 'closingPrayer', label: 'Closing prayer', slots: 1 },
  { role: 'greeters', label: 'Greeters', slots: 2 },
  { role: 'communion', label: 'Lord\'s Supper', slots: 4 }
];

// Every hand-typed field, flattened: [{ key, label, type, section }].
export function handFields(sections = SECTIONS) {
  return sections
    .filter(section => section.source === 'hand')
    .flatMap(section => section.fields.map(field => ({
      key: field.key,
      label: field.label,
      type: field.type || 'text',
      section: section.id
    })));
}

// The set-once sections' ids.
export function standingIds(sections = SECTIONS) {
  return sections.filter(section => section.source === 'standing').map(section => section.id);
}

// Applies the church's own switches over the defaults:
// `overrides = { prayer: { website: true } }`. Unknown ids are an error so a
// typo can't quietly leave a section on.
export function withSwitches(overrides = {}, sections = SECTIONS) {
  const known = new Set(sections.map(section => section.id));
  for (const id of Object.keys(overrides)) {
    if (!known.has(id)) {
      throw new RangeError(`Unknown bulletin section "${id}"`);
    }
  }
  return sections.map(section => {
    const change = overrides[section.id] || {};
    return {
      ...section,
      print: typeof change.print === 'boolean' ? change.print : section.print,
      website: typeof change.website === 'boolean' ? change.website : section.website
    };
  });
}
