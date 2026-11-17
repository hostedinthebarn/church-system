import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBulletin, viewFor, previousSunday, withSwitches, SERVING_ROLES } from '../src/index.js';

const site = {
  name: 'Test Church',
  city: 'Testville',
  contact: { phone: '(555) 0100', email: 'a@example.org' },
  serviceTimes: [ { label: 'Worship', time: '10 am' } ]
};
const events = [
  {
    id: 'pub', title: 'Potluck', startsAt: '2026-11-22T17:00:00Z', announceFrom: '2026-11-01T00:00:00Z',
    isRegularService: false, status: 'scheduled'
  },
  {
    id: 'mem', title: 'Elders only', startsAt: '2026-11-23T00:30:00Z', announceFrom: '2026-11-01T00:00:00Z',
    isRegularService: false, status: 'scheduled', visibility: 'members'
  }
];
const base = { weekOf: '2026-11-15', site, events, hand: { announcements: 'Hello\n- one\n- two' } };
const get = (model, id) => model.sections.find(s => s.id === id);

test('previousSunday', () => {
  assert.equal(previousSunday('2026-11-15'), '2026-11-08');
});

test('a week is built from hand, standing, events and roster', () => {
  const model = buildBulletin({
    ...base,
    standing: { leadership: 'Elders\n- A\n- B' },
    hand: { ...base.hand, prayerRequests: 'Ann is in hospital', military: '- Sam', devotional: 'Do we realize?', figures: 'Worship 100' },
    assignments: [ { role: 'songLeader', date: '2026-11-15', slot: 0, person: 'p1' } ],
    names: { p1: 'Pat P' }
  });
  assert.equal(model.heading, 'Sunday, November 15, 2026');
  assert.deepEqual(get(model, 'announcements').blocks.map(b => b.type), [ 'text', 'list' ]);
  assert.equal(get(model, 'leadership').blocks[0].text, 'Elders');
  assert.deepEqual(get(model, 'prayer').blocks.map(b => b.type), [ 'text', 'subheading', 'list' ]);
  assert.equal(get(model, 'figures').blocks[0].type, 'date');
  assert.equal(get(model, 'figures').blocks[0].text, 'Sunday, November 8, 2026');
  assert.equal(get(model, 'calendar').blocks[0].items.length, 1);
  assert.equal(model.eventCandidates.length, 2);
  assert.equal(get(model, 'serving').blocks[0].groups[0].rows[2].names[0], 'Pat P');
  assert.equal(get(model, 'birthdays').empty, true);
  assert.equal(get(model, 'missions').empty, true);
  assert.deepEqual(model.warnings.map(w => w.code), [ 'unfilled' ]);
  // sorted by panel then order
  const panels = model.sections.map(s => s.panel);
  assert.deepEqual(panels, [ ...panels ].sort());
});

test('contact and service times fall back to the site config; typed text wins', () => {
  const model = buildBulletin({ ...base, standing: { contact: 'Typed contact' } });
  assert.equal(get(model, 'contact').blocks[0].text, 'Typed contact');
  assert.deepEqual(get(model, 'serviceTimes').blocks[0].items, [ 'Worship: 10 am' ]);
  const bare = buildBulletin({ weekOf: '2026-11-15', events: [] });
  assert.equal(get(bare, 'contact').empty, true);
  assert.equal(get(bare, 'serviceTimes').empty, true);
  const partial = buildBulletin({ weekOf: '2026-11-15', site: { contact: {} } });
  assert.deepEqual(get(partial, 'contact').blocks, []);
  const noPlace = buildBulletin({ weekOf: '2026-11-15', site: { contact: { phone: '1' } } });
  assert.equal(get(noPlace, 'contact').blocks[0].text, 'Phone: 1');
});

test('the figures date is checked against last Sunday', () => {
  const stale = buildBulletin({ ...base, hand: { figuresDate: '2025-06-21' } });
  assert.deepEqual(stale.warnings.map(w => w.code), [ 'unfilled', 'figures-date' ]);
  assert.match(stale.warnings[1].message, /June 21, 2025.*November 8, 2026/);
  assert.equal(get(stale, 'figures').blocks[0].text, 'Saturday, June 21, 2025');
  const right = buildBulletin({ ...base, hand: { figuresDate: '2026-11-08' } });
  assert.ok(!right.warnings.some(w => w.code === 'figures-date'));
});

test('a date that is not a Sunday is flagged', () => {
  const model = buildBulletin({ ...base, weekOf: '2026-11-16' });
  assert.equal(model.warnings[0].code, 'not-sunday');
});

test('birthdays only when the switch is on, and then only adults', () => {
  const people = [
    { id: 'a', name: 'Ann', dateOfBirth: '1980-11-17' },
    { id: 'k', name: 'Kid', dateOfBirth: '2015-11-17' }
  ];
  const off = buildBulletin({ ...base, people });
  assert.equal(get(off, 'birthdays').empty, true);
  const on = buildBulletin({ ...base, people, includeBirthdays: true });
  assert.deepEqual(get(on, 'birthdays').blocks[0].items.map(i => i.text), [ 'Ann' ]);
});

test('viewFor: print and website keep only the sections switched on', () => {
  const model = buildBulletin({ ...base, hand: { prayerRequests: 'secret' }, eventChoices: { mem: { membersOk: true } } });
  const print = viewFor(model, 'print');
  const web = viewFor(model, 'website');
  assert.ok(print.sections.some(s => s.id === 'prayer'));
  assert.ok(!web.sections.some(s => s.id === 'prayer'));
  assert.ok(!print.sections.some(s => s.id === 'birthdays'));
  // members-only ticked: printed, never on the website
  assert.equal(get(print, 'calendar').blocks[0].items.length, 2);
  assert.equal(get(web, 'calendar').blocks[0].items.length, 1);
  assert.equal(web.target, 'website');
  assert.throws(() => viewFor(model, 'tv'), /Unknown target/);
});

test('viewFor: a website calendar with only members-only events has none', () => {
  const only = buildBulletin({
    ...base, events: [ events[1] ], eventChoices: { mem: { membersOk: true } }
  });
  const web = viewFor(only, 'website');
  assert.equal(get(web, 'calendar').empty, true);
});

test('the church can switch a section on or off', () => {
  const sections = withSwitches({ prayer: { website: true }, birthdays: { print: true } });
  const model = buildBulletin({ ...base, sections, roles: SERVING_ROLES, hand: { prayerRequests: 'x' } });
  assert.ok(viewFor(model, 'website').sections.some(s => s.id === 'prayer'));
  assert.ok(viewFor(model, 'print').sections.some(s => s.id === 'birthdays'));
});
