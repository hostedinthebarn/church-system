// LGC-101: the JSON-LD builders. The pages are tested in e2e/jsonld.spec.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  postalAddress, chicagoIso, openingHours, churchNode, eventNode, serialize, scriptTag
} = require('../lib/jsonld.js');

const info = {
  address: '1 Main St, Springfield, TX 78000',
  phone: '(555) 010-0000',
  serviceTimes: [
    {
      label: 'Sunday Bible class',
      time: '9:00 am'
    },
    {
      label: 'Sunday worship',
      time: '10:00 am'
    },
    {
      label: 'Wednesday Bible class',
      time: '6:30 pm'
    }
  ]
};
const piece = (extra = {}) => ({
  title: 'Fellowship meal',
  start: new Date('2026-12-06T17:00:00Z'),
  end: new Date('2026-12-06T18:00:00Z'),
  place: 'Fellowship hall',
  ...extra
});
const ctx = {
  info,
  url: 'https://example.org/events/meal',
  locale: 'en'
};

test('the address is split into its parts, and kept whole when it has another shape', () => {
  assert.deepEqual(postalAddress(info.address), {
    '@type': 'PostalAddress',
    streetAddress: '1 Main St',
    addressLocality: 'Springfield',
    addressRegion: 'TX',
    postalCode: '78000'
  });
  assert.deepEqual(postalAddress('Behind the old mill'), {
    '@type': 'PostalAddress',
    streetAddress: 'Behind the old mill'
  });
  assert.equal(postalAddress(''), null);
});

test('opening hours come from the service times, with no closing time invented', () => {
  const hours = openingHours(info.serviceTimes);
  assert.deepEqual(hours.map(h => [ h.dayOfWeek, h.opens ]), [
    [ 'https://schema.org/Sunday', '09:00' ],
    [ 'https://schema.org/Sunday', '10:00' ],
    [ 'https://schema.org/Wednesday', '18:30' ]
  ]);
  assert.ok(hours.every(h => !('closes' in h)));
  // No weekday or no readable time: left out, not guessed.
  assert.deepEqual(openingHours([
    {
      label: 'Prayer meeting',
      time: '7:00 pm'
    },
    {
      label: 'Sunday class',
      time: 'to be confirmed'
    },
    {
      label: 'Domingo, clase',
      time: '9:00 am'
    }
  ]).map(h => h.opens), [ '09:00' ]);
});

test('the Church leaves out what the settings do not hold', () => {
  const bare = churchNode({
    site: { name: 'A Church' },
    info: {},
    url: 'https://example.org/'
  });
  assert.deepEqual(bare, {
    '@type': 'Church',
    name: 'A Church',
    url: 'https://example.org/'
  });
  const full = churchNode({
    site: { name: 'A Church' },
    info,
    url: 'https://example.org/',
    logoUrl: 'https://example.org/logo.png',
    latitude: 29.9,
    longitude: -96.8,
    locale: 'es'
  });
  assert.equal(full.telephone, info.phone);
  assert.equal(full.logo, 'https://example.org/logo.png');
  assert.deepEqual(full.geo, {
    '@type': 'GeoCoordinates',
    latitude: 29.9,
    longitude: -96.8
  });
  assert.equal(full.inLanguage, 'es');
  assert.equal(full.openingHoursSpecification.length, 3);
});

test('the offset follows the daylight saving change', () => {
  // US clocks: forward 2026-03-08, back 2026-11-01.
  assert.equal(chicagoIso('2026-03-07T18:00:00Z'), '2026-03-07T12:00:00-06:00');
  assert.equal(chicagoIso('2026-03-08T17:00:00Z'), '2026-03-08T12:00:00-05:00');
  assert.equal(chicagoIso('2026-10-31T17:00:00Z'), '2026-10-31T12:00:00-05:00');
  assert.equal(chicagoIso('2026-11-01T18:00:00Z'), '2026-11-01T12:00:00-06:00');
  const march = eventNode(piece({
    start: new Date('2026-03-15T15:00:00Z'),
    end: new Date('2026-03-15T16:00:00Z')
  }), ctx);
  assert.equal(march.startDate, '2026-03-15T10:00:00-05:00');
  const november = eventNode(piece({
    start: new Date('2026-11-15T16:00:00Z'),
    end: new Date('2026-11-15T17:00:00Z')
  }), ctx);
  assert.equal(november.startDate, '2026-11-15T10:00:00-06:00');
  assert.equal(november.endDate, '2026-11-15T11:00:00-06:00');
});

test('a one-off event has the required fields', () => {
  const node = eventNode(piece({ description: 'Bring a dish' }), ctx);
  assert.equal(node['@type'], 'Event');
  assert.equal(node.name, 'Fellowship meal');
  assert.equal(node.startDate, '2026-12-06T11:00:00-06:00');
  assert.equal(node.description, 'Bring a dish');
  assert.equal(node.eventAttendanceMode, 'https://schema.org/OfflineEventAttendanceMode');
  assert.equal(node.location['@type'], 'Place');
  assert.equal(node.location.name, 'Fellowship hall');
  assert.equal(node.location.address.postalCode, '78000');
  assert.equal(node.eventStatus, undefined);
});

test('a whole-day event has dates and no offset', () => {
  const node = eventNode(piece({
    allDay: true,
    startDate: '2026-12-10',
    endDate: '2026-12-12'
  }), ctx);
  assert.equal(node.startDate, '2026-12-10');
  assert.equal(node.endDate, '2026-12-12');
});

test('a regular service is no Event unless it is cancelled', () => {
  assert.equal(eventNode(piece({ regularService: true }), ctx), null);
  assert.equal(eventNode(piece({
    regularService: true,
    status: 'scheduled'
  }), ctx), null);
  assert.equal(eventNode(piece({
    regularService: true,
    status: 'cancelled'
  }), ctx).eventStatus, 'https://schema.org/EventCancelled');
  // A changed regular service gives no Event at all.
  assert.equal(eventNode(piece({
    regularService: true,
    status: 'changed'
  }), ctx), null);
});

test('a changed one-off is an Event with no eventStatus', () => {
  const node = eventNode(piece({ status: 'changed' }), ctx);
  assert.equal(node.name, 'Fellowship meal');
  assert.equal(node.eventStatus, undefined);
});

test('a cancelled one-off carries EventCancelled; a members-only event is never marked up', () => {
  assert.equal(eventNode(piece({ status: 'cancelled' }), ctx).eventStatus, 'https://schema.org/EventCancelled');
  assert.equal(eventNode(piece({ publicEvent: false }), ctx), null);
  assert.equal(eventNode(piece({
    publicEvent: false,
    status: 'cancelled'
  }), ctx), null);
});

test('a </script> in a title cannot end the tag, and the value survives', () => {
  const title = '</script><img src=x onerror=alert(1)> & more';
  const tag = scriptTag([ eventNode(piece({
    title,
    description: '<!-- x'
  }), ctx) ]);
  assert.equal(tag.match(/<\/script>/g).length, 1);
  assert.ok(tag.endsWith('</script>'));
  const body = tag.replace(/^<script type="application\/ld\+json">/, '').replace(/<\/script>$/, '');
  assert.doesNotMatch(body, /[<>&]/);
  const parsed = JSON.parse(body);
  assert.equal(parsed['@graph'][0].name, title);
  assert.equal(JSON.parse(serialize({ a: 'x\u2028y\u2029z' })).a, 'x\u2028y\u2029z');
  assert.doesNotMatch(serialize({ a: 'x\u2028y\u2029z' }), /[\u2028\u2029]/);
});

test('no nodes, no script tag', () => {
  assert.equal(scriptTag([]), '');
});

test('an Event carries inLanguage when the page has a locale', () => {
  assert.equal(eventNode(piece(), {
    ...ctx,
    locale: 'es'
  }).inLanguage, 'es');
});

test('an event with no place of its own is at the church', () => {
  const node = eventNode(piece({ place: '' }), { ...ctx, churchName: 'A Church' });
  assert.equal(node.location.name, 'A Church');
  assert.equal(node.location.address.postalCode, '78000');
});
