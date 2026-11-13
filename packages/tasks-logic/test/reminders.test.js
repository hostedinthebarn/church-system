import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remindersFor } from '../src/index.js';

const office = 'office@example.com';
const people = {
  brynna: { email: 'brynna@example.com', reminders: true },
  scott: { email: 'scott@example.com' },
  quiet: { email: 'quiet@example.com', reminders: false },
  nomail: {}
};
const item = (id, title, owner, dueDate, done = false) => ({ id, title, owner, dueDate, done });

test('groups due-today and overdue items by owner, one email each', () => {
  const items = [
    item('1', 'Print', 'brynna', '2026-11-14'),
    item('2', 'Build', 'brynna', '2026-11-13'),
    item('3', 'Late', 'brynna', '2026-11-10'),
    item('4', 'Scott thing', 'scott', '2026-11-14'),
    item('5', 'Next week', 'scott', '2026-11-16')
  ];
  const out = remindersFor({ items, today: '2026-11-14', people, officeAddress: office });
  assert.deepEqual(out.map((m) => m.to), ['brynna@example.com', 'scott@example.com']);
  assert.deepEqual(out[0].items.map((i) => i.id), ['3', '2', '1']); // by due date
  assert.deepEqual(out[1].items.map((i) => i.id), ['4']);
});

test('same-day items sort by title', () => {
  const items = [item('1', 'b', 'brynna', '2026-11-14'), item('2', 'a', 'brynna', '2026-11-14')];
  const out = remindersFor({ items, today: '2026-11-14', people, officeAddress: office });
  assert.deepEqual(out[0].items.map((i) => i.id), ['2', '1']);
});

test('ticked items and items with no day are not reminded', () => {
  const items = [item('1', 'Done', 'brynna', '2026-11-13', true), item('2', 'Whenever', 'brynna', null)];
  assert.deepEqual(remindersFor({ items, today: '2026-11-14', people, officeAddress: office }), []);
});

test('no owner goes to the office, merged into one office email', () => {
  const items = [item('1', 'Unowned', null, '2026-11-14'), item('2', 'Also', undefined, '2026-11-12')];
  const out = remindersFor({ items, today: '2026-11-14', people, officeAddress: office });
  assert.equal(out.length, 1);
  assert.equal(out[0].to, office);
  assert.equal(out[0].items.length, 2);
});

test('an owner with no address on file, or unknown to the directory, falls back to the office', () => {
  const items = [item('1', 'A', 'nomail', '2026-11-14'), item('2', 'B', 'stranger', '2026-11-14')];
  const out = remindersFor({ items, today: '2026-11-14', people, officeAddress: office });
  assert.deepEqual(out.map((m) => [m.to, m.items.length]), [[office, 2]]);
});

test('people who turned reminders off get nothing, and it does not go to the office either', () => {
  const items = [item('1', 'Mine', 'quiet', '2026-11-14')];
  assert.deepEqual(remindersFor({ items, today: '2026-11-14', people, officeAddress: office }), []);
});

test('reminders on by default when the person has no setting', () => {
  const items = [item('1', 'Mine', 'scott', '2026-11-14')];
  assert.equal(remindersFor({ items, today: '2026-11-14', people, officeAddress: office })[0].to, 'scott@example.com');
});

test('addresses already mailed today are skipped, so a re-run sends nothing twice', () => {
  const items = [item('1', 'A', 'brynna', '2026-11-14'), item('2', 'B', 'scott', '2026-11-14')];
  const out = remindersFor({
    items,
    today: '2026-11-14',
    people,
    officeAddress: office,
    alreadySent: ['brynna@example.com']
  });
  assert.deepEqual(out.map((m) => m.to), ['scott@example.com']);
});

test('people defaults to nobody known: everything goes to the office', () => {
  const out = remindersFor({ items: [item('1', 'A', 'brynna', '2026-11-14')], today: '2026-11-14', officeAddress: office });
  assert.equal(out[0].to, office);
});
