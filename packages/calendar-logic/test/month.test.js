import test from 'node:test';
import assert from 'node:assert/strict';
import { weekdayOf } from '../src/dates.js';
import {
  buildMonth, monthBounds, monthFromQuery, monthKey, parseMonth, shiftMonth
} from '../src/month.js';

test('parseMonth accepts real months only', () => {
  assert.deepEqual(parseMonth('2026-12'), { y: 2026, mo: 12 });
  for (const bad of [ '2026-13', '2026-00', '26-12', 'x', '', undefined, [ '2026-12' ], '0999-12', '2026-12-01' ]) {
    assert.equal(parseMonth(bad), null, String(bad));
  }
});

test('monthFromQuery: month, the picker form, or the current month, never an error', () => {
  const today = '2026-11-21';
  assert.deepEqual(monthFromQuery({ month: '2030-02' }, today), { y: 2030, mo: 2 });
  assert.deepEqual(monthFromQuery({ y: '2031', m: '7' }, today), { y: 2031, mo: 7 });
  assert.deepEqual(monthFromQuery({ y: '2031', m: '07' }, today), { y: 2031, mo: 7 });
  assert.deepEqual(monthFromQuery({ month: 'junk' }, today), { y: 2026, mo: 11 });
  assert.deepEqual(monthFromQuery({ y: '99999', m: '1' }, today), { y: 2026, mo: 11 });
  assert.deepEqual(monthFromQuery({ month: { $gt: '' } }, today), { y: 2026, mo: 11 });
  assert.deepEqual(monthFromQuery(undefined, today), { y: 2026, mo: 11 });
});

test('shiftMonth crosses years and stops at the ends', () => {
  assert.deepEqual(shiftMonth({ y: 2026, mo: 12 }, 1), { y: 2027, mo: 1 });
  assert.deepEqual(shiftMonth({ y: 2027, mo: 1 }, -1), { y: 2026, mo: 12 });
  assert.deepEqual(shiftMonth({ y: 2026, mo: 5 }, 120), { y: 2036, mo: 5 });
  assert.equal(shiftMonth({ y: 1000, mo: 1 }, -1), null);
  assert.equal(shiftMonth({ y: 9998, mo: 12 }, 1), null);
  assert.equal(monthKey({ y: 2026, mo: 3 }), '2026-03');
});

test('monthBounds: leap February', () => {
  assert.deepEqual(monthBounds({ y: 2028, mo: 2 }), { first: '2028-02-01', last: '2028-02-29' });
  assert.equal(monthBounds({ y: 2027, mo: 2 }).last, '2027-02-28');
});

const lens = grid => grid.weeks.map(w => w.length);

test('a month starting on Sunday, four weeks (February 2026) has no padding', () => {
  const grid = buildMonth({ y: 2026, mo: 2 }, [], '2026-02-10');
  assert.deepEqual(lens(grid), [ 7, 7, 7, 7 ]);
  assert.ok(grid.weeks.flat().every(d => d.inMonth));
  assert.equal(grid.weeks[0][0].date, '2026-02-01');
  assert.deepEqual(grid.days, []);
});

test('a six-week month (August 2026) pads with the neighbouring months', () => {
  const grid = buildMonth({ y: 2026, mo: 8 }, [], '2026-08-31');
  assert.equal(grid.weeks.length, 6);
  assert.equal(grid.weeks[0][0].date, '2026-07-26');
  assert.equal(grid.weeks[0][0].inMonth, false);
  assert.equal(grid.weeks[5][1].date, '2026-08-31');
  assert.equal(grid.weeks[5][1].isToday, true);
  assert.equal(grid.weeks[5][2].inMonth, false);
});

test('leap February 2028 has 29 days', () => {
  const grid = buildMonth({ y: 2028, mo: 2 }, [], '2028-01-01');
  assert.equal(grid.weeks.flat().filter(d => d.inMonth).length, 29);
});

test('the daylight-saving changes do not move a day (2026-11-01, 2027-03-14)', () => {
  for (const [ month, dst, other ] of [
    [ { y: 2026, mo: 11 }, '2026-11-01', '2026-11-02' ],
    [ { y: 2027, mo: 3 }, '2027-03-14', '2027-03-15' ]
  ]) {
    const grid = buildMonth(month, [ { id: 'a', title: 'A', startDate: dst, endDate: dst } ], '2026-01-01');
    const days = grid.weeks.flat();
    assert.deepEqual(grid.days.map(d => d.date), [ dst ]);
    assert.equal(days.filter(d => d.inMonth).length, month.mo === 11 ? 30 : 31);
    assert.equal(days.find(d => d.date === other).events.length, 0);
    assert.equal(days.find(d => d.date === dst).date, dst);
  }
  // Sundays stay in the first column across the change.
  const nov = buildMonth({ y: 2026, mo: 11 }, [], '2026-11-01');
  assert.equal(nov.weeks[0][0].date, '2026-11-01');
});

test('events: a multi-day event is on every day it touches, clipped to the month', () => {
  const retreat = { id: 'r', title: 'Retreat', startDate: '2026-11-29', endDate: '2026-12-02' };
  const dec = buildMonth({ y: 2026, mo: 12 }, [ retreat ], '2026-12-15');
  assert.deepEqual(dec.days.map(d => d.date), [ '2026-12-01', '2026-12-02' ]);
  assert.equal(dec.days[0].events[0].isFirstDay, false);
  const nov = buildMonth({ y: 2026, mo: 11 }, [ retreat ], '2026-11-15');
  assert.deepEqual(nov.days.map(d => d.date), [ '2026-11-29', '2026-11-30' ]);
  assert.equal(nov.days[0].events[0].isFirstDay, true);
});

test('events: order within a day follows the order given; an event without endDate is one day', () => {
  const grid = buildMonth({ y: 2026, mo: 12 }, [
    { id: 'b', title: 'B', startDate: '2026-12-06' },
    { id: 'a', title: 'A', startDate: '2026-12-05' },
    { id: 'c', title: 'C', startDate: '2026-12-06' },
    { id: 'old', title: 'Old', startDate: '2026-11-01', endDate: '2026-11-02' },
    { id: 'late', title: 'Late', startDate: '2027-01-01' }
  ], '2026-12-01');
  assert.deepEqual(grid.days.map(d => [ d.date, d.events.map(e => e.id) ]), [
    [ '2026-12-05', [ 'a' ] ],
    [ '2026-12-06', [ 'b', 'c' ] ]
  ]);
});

test('the first and last years still build a whole grid', () => {
  assert.equal(weekdayOf(buildMonth({ y: 1000, mo: 1 }, [], '2026-01-01').weeks[0][0].date), 0);
  const last = buildMonth({ y: 9998, mo: 12 }, [], '2026-01-01');
  assert.equal(last.weeks.at(-1)[6].date, '9999-01-02');
});
