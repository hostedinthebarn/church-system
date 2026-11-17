import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, handFields, standingIds, withSwitches, PAGES, SHEET, checkLayout, panelIds } from '../src/index.js';

test('defaults: prayer list off the website, birthdays off everywhere', () => {
  const get = id => SECTIONS.find(s => s.id === id);
  assert.deepEqual([ get('prayer').print, get('prayer').website ], [ true, false ]);
  assert.deepEqual([ get('birthdays').print, get('birthdays').website ], [ false, false ]);
  assert.equal(SECTIONS.filter(s => s.website).length, SECTIONS.length - 2);
});

test('every section is on a real panel and ids are unique', () => {
  const panels = new Set(panelIds());
  assert.ok(SECTIONS.every(s => panels.has(s.panel)));
  assert.equal(new Set(SECTIONS.map(s => s.id)).size, SECTIONS.length);
});

test('hand fields and standing ids', () => {
  const keys = handFields().map(f => f.key);
  assert.ok(keys.includes('prayerRequests') && keys.includes('figuresDate') && keys.includes('devotional'));
  assert.equal(handFields().find(f => f.key === 'figuresDate').type, 'date');
  assert.equal(handFields().find(f => f.key === 'devotional').type, 'text');
  assert.ok(standingIds().includes('leadership'));
  assert.ok(!standingIds().includes('prayer'));
});

test('withSwitches changes only what it is told, and rejects typos', () => {
  const next = withSwitches({ prayer: { website: true }, birthdays: { print: true } });
  assert.equal(next.find(s => s.id === 'prayer').website, true);
  assert.equal(next.find(s => s.id === 'prayer').print, true);
  assert.equal(next.find(s => s.id === 'birthdays').print, true);
  assert.equal(next.find(s => s.id === 'birthdays').website, false);
  assert.equal(withSwitches().length, SECTIONS.length);
  assert.throws(() => withSwitches({ prayr: { print: false } }), /Unknown bulletin section/);
});

test('the layout adds up to the sheet', () => {
  assert.equal(SHEET.widthIn, 14);
  assert.equal(SHEET.heightIn, 8.5);
  assert.equal(checkLayout(), true);
  assert.throws(() => checkLayout([ { id: 'x', panels: [ { widthIn: 5 } ] } ]), /add up/);
  assert.equal(PAGES.length, 2);
});
