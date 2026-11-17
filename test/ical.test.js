const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildFeed, googleCalendarUrl, escapeText, fold
} = require('../lib/ical.js');

const service = {
  id: 'abc',
  title: 'Sunday worship, 10; "all"',
  description: 'Line one\nLine two',
  place: 'Main hall',
  startsAt: '2026-12-06T16:00:00.000Z',
  endsAt: '2026-12-06T17:15:00.000Z',
  allDay: false,
  startDate: '2026-12-06',
  endDate: '2026-12-06',
  status: 'scheduled',
  url: 'https://church.test/events/worship',
  updatedAt: '2026-11-01T12:00:00.000Z'
};
const lines = ics => ics.split('\r\n');

test('a feed is a well-formed calendar with CRLF line ends', () => {
  const ics = buildFeed({
    name: 'Church events',
    host: 'church.test',
    events: [ service ],
    now: new Date('2026-11-17T00:00:00Z')
  });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  const l = lines(ics);
  assert.ok(l.includes('UID:abc@church.test'));
  assert.ok(l.includes('DTSTART:20261206T160000Z'));
  assert.ok(l.includes('DTEND:20261206T171500Z'));
  assert.ok(l.includes('DTSTAMP:20261101T120000Z'));
  assert.ok(l.includes('SUMMARY:Sunday worship\\, 10\\; "all"'));
  assert.ok(l.includes('DESCRIPTION:Line one\\nLine two'));
  assert.ok(l.includes('STATUS:CONFIRMED'));
  assert.ok(l.includes('X-WR-CALNAME:Church events'));
});

test('a cancelled event stays in the feed, marked', () => {
  const ics = buildFeed({
    name: 'x',
    host: 'h',
    events: [ {
      ...service,
      status: 'cancelled'
    } ]
  });
  assert.ok(ics.includes('STATUS:CANCELLED'));
  assert.ok(ics.includes('SUMMARY:CANCELLED: Sunday'));
});

test('an all-day event uses dates, and its end is the day after', () => {
  const ics = buildFeed({
    name: 'x',
    host: 'h',
    events: [ {
      ...service,
      allDay: true,
      startDate: '2026-12-31',
      endDate: '2026-12-31',
      place: '',
      description: '',
      url: null
    } ]
  });
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261231'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20270101'));
  assert.ok(!ics.includes('LOCATION'));
  assert.ok(!ics.includes('URL:'));
});

test('long lines fold at 75 octets without splitting a character', () => {
  const long = `SUMMARY:${'é'.repeat(100)}`;
  const folded = fold(long);
  const parts = folded.split('\r\n');
  assert.ok(parts.length > 1);
  for (const part of parts) {
    assert.ok(Buffer.byteLength(part) <= 75);
  }
  assert.equal(parts.map((p, i) => (i ? p.slice(1) : p)).join(''), long);
  assert.equal(fold('short'), 'short');
});

test('text is escaped', () => {
  assert.equal(escapeText('a\\b;c,d\r\ne'), 'a\\\\b\\;c\\,d\\ne');
  assert.equal(escapeText(undefined), '');
});

test('the Google Calendar link carries the time, place and details', () => {
  const url = new URL(googleCalendarUrl(service));
  assert.equal(url.origin + url.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('dates'), '20261206T160000Z/20261206T171500Z');
  assert.equal(url.searchParams.get('location'), 'Main hall');
  assert.match(url.searchParams.get('details'), /church\.test\/events\/worship/);
  const allDay = new URL(googleCalendarUrl({
    ...service,
    allDay: true,
    startDate: '2026-12-31',
    endDate: '2026-12-31',
    place: '',
    description: '',
    url: null,
    status: 'cancelled'
  }));
  assert.equal(allDay.searchParams.get('dates'), '20261231/20270101');
  assert.equal(allDay.searchParams.get('text'), 'CANCELLED: Sunday worship, 10; "all"');
  assert.equal(allDay.searchParams.has('location'), false);
  assert.equal(allDay.searchParams.has('details'), false);
});
