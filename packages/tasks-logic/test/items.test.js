import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateAsOf, buildWeek, tickItem, syncSystemItems } from '../src/index.js';

const v1 = {
  effectiveFrom: '2026-10-01T00:00:00Z',
  items: [
    { key: 'build', title: 'Build the bulletin', day: 'friday', owner: 'brynna' },
    { key: 'print', title: 'Print the bulletin', day: 'saturday' },
    { key: 'check', title: "Check the coming week's events" }
  ]
};
const v2 = { effectiveFrom: '2026-11-11T12:00:00Z', items: [{ key: 'only', title: 'Only item' }] };

test('template as it stood: latest version at or before the instant', () => {
  assert.deepEqual(templateAsOf([v2, v1], '2026-11-10T00:00:00Z'), v1.items);
  assert.deepEqual(templateAsOf([v2, v1], '2026-11-11T12:00:00Z'), v2.items);
  assert.deepEqual(templateAsOf([v1, v2], '2026-12-01T00:00:00Z'), v2.items);
});

test('template as it stood: nothing before the first version, or no versions at all', () => {
  assert.deepEqual(templateAsOf([v1], '2026-09-01T00:00:00Z'), []);
  assert.deepEqual(templateAsOf([], '2026-09-01T00:00:00Z'), []);
});

test('new week from the template, with due dates and owners', () => {
  const items = buildWeek({ weekStart: '2026-11-09', templateVersions: [v1] });
  assert.deepEqual(
    items.map((i) => [i.id, i.title, i.kind, i.owner, i.dueDate, i.fromLastWeek, i.done]),
    [
      ['2026-11-09:template:build', 'Build the bulletin', 'template', 'brynna', '2026-11-13', false, false],
      ['2026-11-09:template:print', 'Print the bulletin', 'template', null, '2026-11-14', false, false],
      ['2026-11-09:template:check', "Check the coming week's events", 'template', null, null, false, false]
    ]
  );
});

test('a template edit made mid-week applies from the next week, not this one', () => {
  const versions = [v1, v2]; // v2 takes effect Wednesday 11 Nov
  const thisWeek = buildWeek({ weekStart: '2026-11-09', templateVersions: versions });
  const nextWeek = buildWeek({ weekStart: '2026-11-16', templateVersions: versions });
  assert.equal(thisWeek.length, 3);
  assert.deepEqual(nextWeek.map((i) => i.title), ['Only item']);
});

test('unticked items carry over marked "from last week", ticked ones do not', () => {
  const lastWeek = buildWeek({ weekStart: '2026-11-09', templateVersions: [v1] });
  const ticked = tickItem(lastWeek, '2026-11-09:template:build', { by: 'brynna', at: '2026-11-12T20:00:00Z' });
  const next = buildWeek({ weekStart: '2026-11-16', templateVersions: [v1], previousItems: ticked });
  const carried = next.filter((i) => i.fromLastWeek);
  assert.deepEqual(carried.map((i) => i.id), ['2026-11-09:template:print', '2026-11-09:template:check']);
  assert.equal(carried[0].dueDate, '2026-11-14'); // keeps its date, so it reads as overdue
  assert.equal(next.filter((i) => !i.fromLastWeek).length, 3);
  assert.equal(lastWeek[1].fromLastWeek, false); // input untouched
});

test('system items carry over too while open', () => {
  const prev = syncSystemItems([], [{ sourceKey: 'fb:1', title: 'Post failed' }], '2026-11-10T12:00:00Z');
  const next = buildWeek({ weekStart: '2026-11-16', previousItems: prev });
  assert.equal(next.length, 1);
  assert.equal(next[0].fromLastWeek, true);
  assert.equal(next[0].kind, 'system');
});

test('one-offs are added, with generated or given ids', () => {
  const items = buildWeek({
    weekStart: '2026-11-09',
    oneOffs: [
      { title: 'Call the plumber', day: 'tuesday', owner: 'scott' },
      { id: 'custom-1', title: 'Order flowers' }
    ]
  });
  assert.deepEqual(
    items.map((i) => [i.id, i.kind, i.owner, i.dueDate]),
    [
      ['2026-11-09:one-off:1', 'one-off', 'scott', '2026-11-10'],
      ['custom-1', 'one-off', null, null]
    ]
  );
});

test('tickItem records who and when, and leaves other items alone', () => {
  const items = buildWeek({ weekStart: '2026-11-09', templateVersions: [v1] });
  const after = tickItem(items, '2026-11-09:template:print', { by: 'scott', at: new Date('2026-11-14T15:00:00Z') });
  assert.equal(after[1].done, true);
  assert.equal(after[1].doneBy, 'scott');
  assert.equal(after[1].doneAt, '2026-11-14T15:00:00.000Z');
  assert.equal(after[1].resolvedBySystem, false);
  assert.equal(after[0].done, false);
  assert.equal(items[1].done, false);
});

test('ticking a closed item changes nothing; ticking an unknown item is an error', () => {
  const items = buildWeek({ weekStart: '2026-11-09', templateVersions: [v1] });
  const once = tickItem(items, '2026-11-09:template:print', { by: 'scott', at: '2026-11-14T15:00:00Z' });
  const twice = tickItem(once, '2026-11-09:template:print', { by: 'brynna', at: '2026-11-14T16:00:00Z' });
  assert.equal(twice[1].doneBy, 'scott');
  assert.throws(() => tickItem(items, 'nope', { by: 'x', at: '2026-11-14T15:00:00Z' }), /No such item/);
});

const fbFailed = { sourceKey: 'facebook-failed:42', title: 'Facebook post failed: Potluck', owner: 'brynna', dueDate: '2026-11-13' };

test('a live condition adds one system item, once', () => {
  const first = syncSystemItems([], [fbFailed], '2026-11-10T12:00:00Z');
  assert.equal(first.length, 1);
  assert.deepEqual(
    [first[0].id, first[0].kind, first[0].owner, first[0].dueDate, first[0].done],
    ['system:facebook-failed:42', 'system', 'brynna', '2026-11-13', false]
  );
  const again = syncSystemItems(first, [fbFailed], '2026-11-10T13:00:00Z');
  assert.equal(again.length, 1);
  assert.equal(again[0].done, false);
});

test('a cleared condition ticks its item "resolved by the system"', () => {
  const open = syncSystemItems([], [fbFailed], '2026-11-10T12:00:00Z');
  const closed = syncSystemItems(open, [], '2026-11-11T09:00:00Z');
  assert.equal(closed[0].done, true);
  assert.equal(closed[0].resolvedBySystem, true);
  assert.equal(closed[0].doneBy, null);
  assert.equal(closed[0].doneAt, '2026-11-11T09:00:00.000Z');
});

test('only system items auto-resolve; template and one-off items are left alone', () => {
  const base = buildWeek({ weekStart: '2026-11-09', templateVersions: [v1], oneOffs: [{ title: 'x' }] });
  const after = syncSystemItems(base, [], '2026-11-11T09:00:00Z');
  assert.ok(after.every((i) => !i.done));
});

test('a manual tick closes a system item, and it is not re-added while the condition lasts', () => {
  const open = syncSystemItems([], [fbFailed], '2026-11-10T12:00:00Z');
  const accepted = tickItem(open, 'system:facebook-failed:42', { by: 'brynna', at: '2026-11-10T14:00:00Z' });
  assert.equal(accepted[0].resolvedBySystem, false);
  const later = syncSystemItems(accepted, [fbFailed], '2026-11-11T09:00:00Z');
  assert.equal(later.length, 1);
  assert.equal(later[0].doneBy, 'brynna');
  const cleared = syncSystemItems(accepted, [], '2026-11-12T09:00:00Z');
  assert.equal(cleared[0].resolvedBySystem, false); // stays a manual tick
  assert.equal(cleared[0].doneBy, 'brynna');
});

test('an item resolved by the system is not re-opened if the condition returns', () => {
  const open = syncSystemItems([], [fbFailed], '2026-11-10T12:00:00Z');
  const closed = syncSystemItems(open, [], '2026-11-11T09:00:00Z');
  const back = syncSystemItems(closed, [fbFailed], '2026-11-12T09:00:00Z');
  assert.equal(back.length, 1);
  assert.equal(back[0].done, true);
});
