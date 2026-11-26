// JSON-LD structured data for the public pages (LGC-101): a `Church` on the
// home page and an `Event` for each one-off public event. Every value comes
// from the church's settings or the event itself: nothing is written here and
// nothing is guessed. A value that isn't there is left out.
//
// Regular services (the Sunday class and worship, the Wednesday class) are
// never Events: 52 a year reads as spam, and their times belong to the
// church's openingHoursSpecification. A regular service appears as an Event
// only when it is cancelled or changed, because then it is news.
const { instantToLocal } = require('@church-system/calendar-logic');
const { offsetMinutes, toMs } = require('@church-system/calendar-logic/src/dates.js');

const CONTEXT = 'https://schema.org';

// The settings hold the address as one line: "646 E Hwy 71 Business, La
// Grange, TX 78945". Split it when it has that shape; otherwise keep the
// whole line as the street address rather than guess at its parts. The
// country isn't in the settings, so it is left out.
function postalAddress(address) {
  const text = String(address || '').trim();
  if (!text) {
    return null;
  }
  const m = /^(.+?),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(text);
  if (!m) {
    return {
      '@type': 'PostalAddress',
      streetAddress: text
    };
  }
  return {
    '@type': 'PostalAddress',
    streetAddress: m[1].trim(),
    addressLocality: m[2].trim(),
    addressRegion: m[3].toUpperCase(),
    postalCode: m[4]
  };
}

// An instant as ISO 8601 in America/Chicago, with the offset in force on that
// day: 2026-03-08T12:00:00-05:00 but 2026-03-07T12:00:00-06:00.
function chicagoIso(instant) {
  const ms = toMs(instant);
  const { date, time } = instantToLocal(new Date(ms));
  const minutes = offsetMinutes(ms);
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${date}T${time}:00${sign}${hh}:${mm}`;
}

const DAYS = [
  [ 'Sunday', /\b(sunday|domingo)s?\b/ ],
  [ 'Monday', /\b(monday|lunes)\b/ ],
  [ 'Tuesday', /\b(tuesday|martes)\b/ ],
  [ 'Wednesday', /\b(wednesday|miercoles)\b/ ],
  [ 'Thursday', /\b(thursday|jueves)\b/ ],
  [ 'Friday', /\b(friday|viernes)\b/ ],
  [ 'Saturday', /\b(saturday|sabado)\b/ ]
];

function dayOf(label) {
  const plain = String(label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const found = DAYS.find(([ , pattern ]) => pattern.test(plain));
  return found ? found[0] : null;
}

// "9:00 am", "6:30 pm", "18:30" to "09:00". Anything else is null.
function timeOf(text) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m\.?)?\s*$/i.exec(String(text || ''));
  if (!m) {
    return null;
  }
  let hours = Number(m[1]);
  const minutes = Number(m[2] || 0);
  if (m[3]) {
    if (hours < 1 || hours > 12) {
      return null;
    }
    hours = (hours % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0);
  }
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// One entry per service time the office has set that names a weekday and a
// time. The settings hold a label and a time and no end time, so only `opens`
// is given: closing times aren't invented.
function openingHours(serviceTimes) {
  const out = [];
  for (const item of serviceTimes || []) {
    const day = dayOf(item && item.label);
    const opens = timeOf(item && item.time);
    if (day && opens) {
      out.push({
        '@type': 'OpeningHoursSpecification',
        name: item.label,
        dayOfWeek: `${CONTEXT}/${day}`,
        opens
      });
    }
  }
  return out;
}

// `ctx`: { site, info, url, logoUrl, locale, latitude, longitude }
function churchNode(ctx) {
  const {
    site, info = {}, url, logoUrl, locale
  } = ctx;
  const node = {
    '@type': 'Church',
    name: site.name,
    url
  };
  if (logoUrl) {
    node.logo = logoUrl;
  }
  const address = postalAddress(info.address);
  if (address) {
    node.address = address;
  }
  if (info.phone) {
    node.telephone = info.phone;
  }
  const lat = Number(ctx.latitude);
  const lon = Number(ctx.longitude);
  if (ctx.latitude !== undefined && ctx.longitude !== undefined && ctx.latitude !== '' && ctx.longitude !== '' &&
    Number.isFinite(lat) && Number.isFinite(lon)) {
    node.geo = {
      '@type': 'GeoCoordinates',
      latitude: lat,
      longitude: lon
    };
  }
  const hours = openingHours(info.serviceTimes);
  if (hours.length) {
    node.openingHoursSpecification = hours;
  }
  if (locale) {
    node.inLanguage = locale;
  }
  return node;
}

// An Event for one piece, or null when it must not be marked up: a members-only
// event (private), or a regular service that is neither cancelled nor changed.
// `ctx`: { info, churchName, url (the event's own address), locale }
function eventNode(piece, ctx) {
  if (!piece || piece.publicEvent === false) {
    return null;
  }
  const status = piece.status || 'scheduled';
  if (piece.regularService && status === 'scheduled') {
    return null;
  }
  if (!piece.start || !piece.title) {
    return null;
  }
  const node = {
    '@type': 'Event',
    name: piece.title
  };
  if (piece.allDay) {
    // A whole day has a date and no time or offset.
    node.startDate = piece.startDate || instantToLocal(new Date(toMs(piece.start))).date;
    const last = piece.endDate || node.startDate;
    if (last !== node.startDate) {
      node.endDate = last;
    }
  } else {
    node.startDate = chicagoIso(piece.start);
    if (piece.end && toMs(piece.end) > toMs(piece.start)) {
      node.endDate = chicagoIso(piece.end);
    }
  }
  if (piece.description) {
    node.description = piece.description;
  }
  if (status === 'cancelled') {
    node.eventStatus = `${CONTEXT}/EventCancelled`;
  } else if (status === 'changed') {
    node.eventStatus = `${CONTEXT}/EventRescheduled`;
  }
  node.eventAttendanceMode = `${CONTEXT}/OfflineEventAttendanceMode`;
  const address = postalAddress(ctx.info && ctx.info.address);
  if (piece.place || address) {
    const place = { '@type': 'Place' };
    // Google wants a name on the Place: the church's own, when no place is set.
    const name = piece.place || ctx.churchName;
    if (name) {
      place.name = name;
    }
    if (address) {
      place.address = address;
    }
    node.location = place;
  }
  if (ctx.url) {
    node.url = ctx.url;
  }
  if (ctx.locale) {
    node.inLanguage = ctx.locale;
  }
  return node;
}

// JSON for inside a <script> element. JSON.stringify leaves `<`, `>` and `&`
// alone, so a `</script>` in an event title would end the tag and let the rest
// run as HTML. They are written as \u escapes, which JSON parsers read back as
// the same characters. U+2028 and U+2029 are escaped too.
function serialize(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function scriptTag(nodes) {
  if (!nodes.length) {
    return '';
  }
  return `<script type="application/ld+json">${serialize({
    '@context': CONTEXT,
    '@graph': nodes
  })}</script>`;
}

module.exports = {
  postalAddress,
  chicagoIso,
  openingHours,
  churchNode,
  eventNode,
  serialize,
  scriptTag
};
