const test = require('node:test');
const assert = require('node:assert/strict');
const { formatDate } = require('../lib/dates.js');

test('a calendar day never shifts, whatever the time zone', () => {
  assert.equal(formatDate('2026-11-29', 'long', 'en-US'), 'Sunday, November 29, 2026');
  assert.equal(formatDate('2026-11-29', 'medium', 'en-US'), 'Sun, Nov 29, 2026');
  assert.equal(formatDate('2026-11-29', 'short', 'en-US'), 'Sun, Nov 29');
  assert.equal(formatDate('2026-01-01', 'short', 'en-US', 'Pacific/Kiritimati'), 'Thu, Jan 1');
});

test('a month reads as a month', () => {
  assert.equal(formatDate('2026-12', 'month', 'en-US'), 'December 2026');
});

test('the locale decides the words and the order', () => {
  assert.equal(formatDate('2026-11-29', 'long', 'es'), 'domingo, 29 de noviembre de 2026');
  assert.equal(formatDate('2026-11-29', 'medium', 'en-GB'), 'Sun, 29 Nov 2026');
});

test('empty and unreadable values', () => {
  assert.equal(formatDate(''), '');
  assert.equal(formatDate(null), '');
  assert.equal(formatDate('soon'), 'soon');
  assert.equal(formatDate('2026-11-29', 'nonsense', 'en-US'), 'Sun, Nov 29, 2026');
});
