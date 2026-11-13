import test from 'node:test';
import assert from 'node:assert/strict';
import { announceFrom } from '../src/announce.js';

const now = '2026-11-13T12:00:00Z';

test('default is 14 days before the start', () => {
  assert.equal(announceFrom('2026-12-25T18:00:00Z', now), '2026-12-11T18:00:00.000Z');
});

test('sooner than 14 days: announced now', () => {
  assert.equal(announceFrom('2026-11-20T18:00:00Z', new Date(now)), '2026-11-13T12:00:00.000Z');
});

test('an explicit earlier date wins', () => {
  assert.equal(announceFrom('2026-12-25T18:00:00Z', now, '2026-11-15T00:00:00Z'), '2026-11-15T00:00:00.000Z');
  assert.equal(announceFrom('2026-11-20T18:00:00Z', now, new Date('2026-11-01T00:00:00Z')), '2026-11-01T00:00:00.000Z');
});

test('null means no explicit date', () => {
  assert.equal(announceFrom('2026-12-25T18:00:00Z', now, null), '2026-12-11T18:00:00.000Z');
});
