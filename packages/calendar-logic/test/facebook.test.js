import test from 'node:test';
import assert from 'node:assert/strict';
import { facebookAction } from '../src/facebook.js';

const now = '2026-11-13T12:00:00Z';
const base = {
  isPublic: true, isRegularService: false, status: 'scheduled',
  startsAt: '2026-11-20T18:00:00Z', endsAt: '2026-11-20T19:00:00Z', place: 'Hall',
  announceFrom: '2026-11-06T18:00:00Z'
};
const act = (previous, current, posted, at = now) => facebookAction({ previous, current, posted, now: at });

test('members-only never posts', () => {
  assert.equal(act(null, { ...base, isPublic: false }, false), 'none');
  assert.equal(act(base, { ...base, isPublic: false, status: 'cancelled' }, true), 'none');
});

test('first post when announce-from has arrived', () => {
  assert.equal(act(null, base, false), 'post');
});

test('no post before announce-from, after the start, or when cancelled', () => {
  assert.equal(act(null, { ...base, announceFrom: '2026-11-14T00:00:00Z' }, false), 'none');
  assert.equal(act(null, { ...base, startsAt: '2026-11-13T11:00:00Z' }, false), 'none');
  assert.equal(act(base, { ...base, status: 'cancelled' }, false), 'none');
});

test('posted event: time or place change is an Updated edit', () => {
  assert.equal(act(base, { ...base, startsAt: '2026-11-21T18:00:00Z' }, true), 'edit-updated');
  assert.equal(act(base, { ...base, endsAt: '2026-11-20T20:00:00Z' }, true), 'edit-updated');
  assert.equal(act(base, { ...base, place: 'Auditorium' }, true), 'edit-updated');
});

test('posted event: cancel edits to CANCELLED, once', () => {
  const cancelled = { ...base, status: 'cancelled' };
  assert.equal(act(base, cancelled, true), 'edit-cancelled');
  assert.equal(act(cancelled, cancelled, true), 'none');
  assert.equal(act(base, { ...cancelled, place: 'Auditorium' }, true), 'edit-cancelled');
  assert.equal(act(cancelled, { ...cancelled, place: 'X' }, true), 'none');
});

test('posted event: other edits do nothing', () => {
  assert.equal(act(base, { ...base, title: 'new' }, true), 'none');
  assert.equal(act(null, base, true), 'none');
});

const reg = { ...base, isRegularService: true };

test('regular service: ordinary edits and plain creation never post', () => {
  assert.equal(act(null, reg, false), 'none');
  assert.equal(act(reg, reg, false), 'none');
  assert.equal(act(reg, { ...reg, place: 'Hall 2' }, false), 'none');
  assert.equal(act(null, { ...reg, status: 'cancelled' }, false), 'none');
});

test('regular service: cancelled or moved posts once, then edits', () => {
  const cancelled = { ...reg, status: 'cancelled' };
  const moved = { ...reg, startsAt: '2026-11-20T20:00:00Z' };
  assert.equal(act(reg, cancelled, false), 'post');
  assert.equal(act(reg, moved, false), 'post');
  assert.equal(act(reg, cancelled, true), 'edit-cancelled');
  assert.equal(act(reg, moved, true), 'edit-updated');
  assert.equal(act(moved, { ...moved, endsAt: '2026-11-20T22:00:00Z' }, true), 'edit-updated');
});

test('regular service: tick-box off keeps it quiet', () => {
  assert.equal(act(reg, { ...reg, status: 'cancelled', facebookOnChange: false }, false), 'none');
  assert.equal(act(reg, { ...reg, status: 'cancelled', facebookOnChange: true }, false), 'post');
});
