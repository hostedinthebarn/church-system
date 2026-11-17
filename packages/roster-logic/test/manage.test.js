import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  awaySundays, checkRoster, diffAssignments, dutiesOf, layoutRoster, layoutText, rosterConditions, swapSlot
} from '../src/index.js';

// Placeholder people only. December 2026 Sundays: 6, 13, 20, 27.
const roles = [
  { id: 'trays', name: 'Trays', slots: 1, period: 'monthly' },
  { id: 'song', name: 'Song leader', slots: 1, period: 'weekly' },
  { id: 'greet', name: 'Greeters', slots: 2, period: 'weekly' }
];
const names = { a: 'Alder', b: 'Birch', c: 'Cedar' };
const DEC = ['2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27'];

function full() {
  return [
    { role: 'trays', date: null, slot: 1, person: 'a' },
    ...DEC.flatMap((date) => [
      { role: 'song', date, slot: 1, person: 'b' },
      { role: 'greet', date, slot: 1, person: 'c' },
      { role: 'greet', date, slot: 2, person: 'd' }
    ])
  ];
}

test('awaySundays keeps only the month\'s Sundays inside each span', () => {
  const spans = [
    { person: 'a', startDate: '2026-12-10', endDate: '2026-12-20' },
    { person: 'b', startDate: '2026-12-06' },
    { person: 'c', startDate: '2026-11-01', endDate: '2026-11-30' }
  ];
  assert.deepEqual(awaySundays(spans, '2026-12'), [
    { person: 'a', date: '2026-12-13' },
    { person: 'a', date: '2026-12-20' },
    { person: 'b', date: '2026-12-06' }
  ]);
  assert.throws(() => awaySundays(spans, 'x'), RangeError);
});

test('checkRoster: a clean roster has only the double-booking it really has', () => {
  // Alder holds Trays all month and nothing else; Birch songs; Cedar and Dan greet.
  assert.deepEqual(checkRoster({ month: '2026-12', roles, assignments: full(), names }), []);
});

test('checkRoster flags empty slots, duplicates, away and double booking', () => {
  const assignments = full()
    .map((a) => (a.role === 'song' && a.date === DEC[0] ? { ...a, person: null } : a))
    .map((a) => (a.role === 'greet' && a.date === DEC[1] && a.slot === 2 ? { ...a, person: 'c' } : a))
    .map((a) => (a.role === 'song' && a.date === DEC[2] ? { ...a, person: 'a' } : a));
  assignments.splice(assignments.findIndex((a) => a.role === 'greet' && a.date === DEC[3] && a.slot === 2), 1);
  const away = [
    { person: 'b', date: DEC[1] },
    { person: 'a', date: DEC[2] },
    { person: 'a', date: DEC[3] }
  ];
  const w = checkRoster({ month: '2026-12', roles, assignments, away, names });
  const by = (type) => w.filter((x) => x.type === type);
  assert.deepEqual(by('empty').map((x) => [x.role, x.date]), [['song', DEC[0]], ['greet', DEC[3]]]);
  assert.match(by('empty')[0].message, /Song leader: slot 1 on 2026-12-06 is empty/);
  assert.deepEqual(by('duplicate').map((x) => [x.person, x.date]), [['c', DEC[1]]]);
  assert.match(by('duplicate')[0].message, /Cedar is down twice/);
  assert.deepEqual(by('away').map((x) => [x.role, x.person, x.date]), [
    ['trays', 'a', null],
    ['song', 'b', DEC[1]],
    ['song', 'a', DEC[2]]
  ]);
  assert.match(by('away')[0].message, /Alder is away 2026-12-20, 2026-12-27/);
  assert.match(by('away')[2].message, /Alder is away 2026-12-20\./);
  // Alder: Trays all month plus song on the 20th.
  assert.deepEqual(by('double-booked').map((x) => [x.person, x.date]), [['a', DEC[2]]]);
  assert.match(by('double-booked')[0].message, /Alder has Trays and Song leader on 2026-12-20/);
});

test('checkRoster names a person by id when no name is known, and counts a monthly role once per Sunday', () => {
  const assignments = [{ role: 'trays', date: null, slot: 1, person: 'z' }];
  const w = checkRoster({ month: '2026-12', roles: [roles[0]], assignments, away: [{ person: 'z', date: DEC[0] }] });
  assert.equal(w.length, 1);
  assert.match(w[0].message, /z is away 2026-12-06\./);
  // A monthly role listed twice for one person on one Sunday is not a double booking.
  assert.deepEqual(
    checkRoster({
      month: '2026-12',
      roles: [{ ...roles[0], slots: 2 }],
      assignments: [
        { role: 'trays', date: null, slot: 1, person: 'z' },
        { role: 'trays', date: null, slot: 2, person: 'z' }
      ]
    }).map((x) => x.type),
    ['duplicate']
  );
});

test('swapSlot changes one slot, reports the old holder and leaves the input alone', () => {
  const before = full();
  const { assignments, previous } = swapSlot(before, { role: 'song', date: DEC[1], slot: 1 }, 'c');
  assert.equal(previous, 'b');
  assert.equal(assignments.find((a) => a.role === 'song' && a.date === DEC[1]).person, 'c');
  assert.equal(before.find((a) => a.role === 'song' && a.date === DEC[1]).person, 'b');
  assert.deepEqual(swapSlot(before, { role: 'trays', date: null, slot: 1 }, null).previous, 'a');
  assert.throws(() => swapSlot(before, { role: 'song', date: '2026-12-07', slot: 1 }, 'a'), /No such slot: song 2026-12-07 1/);
  assert.throws(() => swapSlot(before, { role: 'trays', date: null, slot: 9 }, 'a'), /No such slot: trays month 9/);
});

test('diffAssignments lists the slots that changed hands', () => {
  const before = full();
  const after = swapSlot(swapSlot(before, { role: 'song', date: DEC[1], slot: 1 }, 'c').assignments,
    { role: 'trays', date: null, slot: 1 }, null).assignments;
  assert.deepEqual(diffAssignments(before, after), [
    { role: 'trays', date: null, slot: 1, from: 'a', to: null },
    { role: 'song', date: DEC[1], slot: 1, from: 'b', to: 'c' }
  ]);
  assert.deepEqual(diffAssignments(before, before), []);
  // A slot in only one version is empty in the other.
  assert.deepEqual(diffAssignments([], [{ role: 'x', date: null, slot: 1, person: 'a' }]),
    [{ role: 'x', date: null, slot: 1, from: null, to: 'a' }]);
  assert.deepEqual(diffAssignments([{ role: 'x', date: null, slot: 1, person: 'a' }], []),
    [{ role: 'x', date: null, slot: 1, from: 'a', to: null }]);
});

test('layoutRoster and layoutText print the month, with gaps called out', () => {
  const assignments = full().filter((a) => !(a.role === 'greet' && a.date === DEC[0] && a.slot === 2));
  const layout = layoutRoster({ month: '2026-12', roles, assignments, names: { ...names, d: 'Dan' } });
  assert.deepEqual(layout.monthly, [{ role: 'trays', name: 'Trays', people: ['Alder'] }]);
  assert.equal(layout.weekly.length, 4);
  assert.deepEqual(layout.weekly[0].rows[1], { role: 'greet', name: 'Greeters', people: ['Cedar', null] });
  const text = layoutText(layout);
  assert.match(text, /^All month\nTrays: Alder\n\n2026-12-06\nSong leader: Birch\nGreeters: Cedar, \(unfilled\)/);
  // Unknown ids print as the id; no monthly roles means no "all month" block; no slots, no names.
  const bare = layoutRoster({
    month: '2026-12',
    roles: [{ ...roles[1], slots: 0 }],
    assignments: [{ role: 'song', date: DEC[0], slot: 1, person: 'q' }]
  });
  assert.equal(layoutText(bare, { allMonth: 'Mes', unfilled: 'vacío' }).split('\n\n')[0], '2026-12-06\nSong leader: vacío');
  const ids = layoutRoster({ month: '2026-12', roles: [roles[1]], assignments: [{ role: 'song', date: DEC[0], slot: 1, person: 'q' }] });
  assert.equal(ids.weekly[0].rows[0].people[0], 'q');
});

test('dutiesOf lists what one person is down for, in date order', () => {
  const duties = dutiesOf({ person: 'a', roles, assignments: [
    { role: 'song', date: DEC[2], slot: 1, person: 'a' },
    { role: 'song', date: DEC[0], slot: 1, person: 'a' },
    { role: 'trays', date: null, slot: 1, person: 'a' },
    { role: 'gone', date: DEC[0], slot: 1, person: 'a' },
    { role: 'song', date: DEC[1], slot: 1, person: 'b' },
    { role: 'greet', date: DEC[0], slot: 1, person: 'a' }
  ] });
  assert.deepEqual(duties.map((d) => [d.role, d.date]), [
    ['trays', null], ['song', DEC[0]], ['greet', DEC[0]], ['song', DEC[2]]
  ]);
});

test('rosterConditions: next month, from two weeks out, until it is published', () => {
  // December starts on the 1st: the task appears on 2026-11-17 and is due 2026-11-24.
  assert.deepEqual(rosterConditions({ today: '2026-11-16' }), []);
  assert.deepEqual(rosterConditions({ today: '2026-11-17' }), [{
    sourceKey: 'roster:2026-12',
    title: 'Build and publish the servers roster for 2026-12',
    owner: null,
    dueDate: '2026-11-24',
    month: '2026-12'
  }]);
  assert.equal(rosterConditions({ today: '2026-11-30' }).length, 1);
  assert.deepEqual(rosterConditions({ today: '2026-11-20', published: ['2026-12'] }), []);
  assert.equal(rosterConditions({ today: '2026-11-20', published: ['2026-11'] }).length, 1);
  // Across the year end, and with another lead time.
  assert.equal(rosterConditions({ today: '2026-12-20' })[0].month, '2027-01');
  assert.equal(rosterConditions({ today: '2026-10-20' })[0].month, '2026-11');
  assert.deepEqual(rosterConditions({ today: '2026-11-17', leadDays: 7 }), []);
});
