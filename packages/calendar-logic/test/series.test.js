import test from 'node:test';
import assert from 'node:assert/strict';
import { occurrencesToChange, topUp } from '../src/series.js';
import { expandRule } from '../src/repeat.js';

const occ = [
  { id: 'c', startsAt: '2026-11-22T16:00:00Z' },
  { id: 'a', startsAt: '2026-11-08T16:00:00Z' },
  { id: 'b', startsAt: '2026-11-15T16:00:00Z' }
];

test('this one only', () => {
  assert.deepEqual(occurrencesToChange(occ, 'b', 'this').map((o) => o.id), ['b']);
});

test('this and all after, whatever order the records come in', () => {
  assert.deepEqual(occurrencesToChange(occ, 'b', 'following').map((o) => o.id), ['b', 'c']);
  assert.deepEqual(occurrencesToChange(occ, 'a', 'following').map((o) => o.id), ['a', 'b', 'c']);
  assert.equal(occ[0].id, 'c'); // input not reordered
});

test('bad id or scope', () => {
  assert.throws(() => occurrencesToChange(occ, 'zz', 'this'), /No occurrence/);
  assert.throws(() => occurrencesToChange(occ, 'a', 'all'), /Unknown scope/);
});

const rule = { freq: 'weekly', start: '2026-01-04', time: '10:00' };

test('top-up fills 12 months ahead from nothing, starting today', () => {
  const made = topUp(rule, [], '2026-11-13');
  assert.equal(made[0].date, '2026-11-15');
  assert.equal(made.at(-1).date, '2027-11-07');
  assert.equal(made.length, 52);
});

test('top-up is idempotent', () => {
  const first = topUp(rule, [], '2026-11-13');
  assert.deepEqual(topUp(rule, first.map((o) => o.date), '2026-11-13'), []);
  assert.deepEqual(topUp(rule, first.map((o) => o.date), '2026-11-13', 12), []);
});

test('top-up creates only the new tail as days pass, and skips existing dates', () => {
  const first = topUp(rule, [], '2026-11-13').map((o) => o.date);
  const later = topUp(rule, first, '2026-11-20');
  assert.deepEqual(later.map((o) => o.date), ['2027-11-14']);
  const gap = topUp(rule, first.filter((d) => d !== '2026-11-22'), '2026-11-13');
  assert.deepEqual(gap.map((o) => o.date), ['2026-11-22']);
});

test('top-up never backfills the past, respects until and months', () => {
  assert.equal(topUp(rule, [], '2026-11-13')[0].date >= '2026-11-13', true);
  const ended = topUp({ ...rule, until: '2026-12-01' }, [], '2026-11-13');
  assert.deepEqual(ended.map((o) => o.date), ['2026-11-15', '2026-11-22', '2026-11-29']);
  assert.equal(topUp(rule, [], '2026-11-13', 1).at(-1).date, '2026-12-13');
  assert.throws(() => topUp(rule, [], 'x'), RangeError);
  assert.deepEqual(topUp(rule, [], '2026-11-13').map((o) => o.date),
    expandRule(rule, '2027-11-13').filter((o) => o.date >= '2026-11-13').map((o) => o.date));
});
