import test from 'node:test';
import assert from 'node:assert/strict';
import { bulletinEvents } from '../src/bulletin.js';

// Print date Sunday 2026-11-15, window 15 Nov 00:00 to 29 Nov 00:00 Chicago.
const ev = (id, startsAt, extra = {}) => ({
  id, startsAt, announceFrom: '2026-11-01T00:00:00Z', isRegularService: false, status: 'scheduled', ...extra
});
const ids = (list) => list.map((e) => e.id);
const print = '2026-11-15';

test('window edges (Chicago midnight)', () => {
  const list = bulletinEvents([
    ev('before', '2026-11-15T05:59:00Z'),   // 14 Nov 23:59 CST
    ev('first', '2026-11-15T06:00:00Z'),    // 15 Nov 00:00 CST
    ev('last', '2026-11-29T05:59:00Z'),     // 28 Nov 23:59
    ev('after', '2026-11-29T06:00:00Z')     // 29 Nov 00:00
  ], print);
  assert.deepEqual(ids(list), ['first', 'last']);
});

test('only announced events, announce-from by the end of the print day', () => {
  const list = bulletinEvents([
    ev('late', '2026-11-20T18:00:00Z', { announceFrom: '2026-11-16T06:00:00Z' }),
    ev('today', '2026-11-20T18:00:00Z', { announceFrom: '2026-11-16T05:59:00Z' })
  ], print);
  assert.deepEqual(ids(list), ['today']);
});

test('regular services only when cancelled or changed', () => {
  const reg = { isRegularService: true };
  const list = bulletinEvents([
    ev('plain', '2026-11-22T16:00:00Z', reg),
    ev('cancelled', '2026-11-22T16:00:00Z', { ...reg, status: 'cancelled' }),
    ev('moved', '2026-11-18T16:00:00Z', { ...reg, status: 'changed' })
  ], print);
  assert.deepEqual(ids(list), ['moved', 'cancelled']);
});

test('office untick, cancelled normal events kept, members-only included, sorted', () => {
  const list = bulletinEvents([
    ev('b', '2026-11-25T16:00:00Z', { isPublic: false }),
    ev('hidden', '2026-11-20T16:00:00Z', { inBulletin: false }),
    ev('shown', '2026-11-21T16:00:00Z', { inBulletin: true }),
    ev('a', '2026-11-19T16:00:00Z', { status: 'cancelled' })
  ], print);
  assert.deepEqual(ids(list), ['a', 'shown', 'b']);
});

test('bad print date', () => {
  assert.throws(() => bulletinEvents([], '15 Nov'), RangeError);
});
