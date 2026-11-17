// Calendar feeds and the "Add to Google Calendar" link (LGC-41), as plain
// functions over event objects so they are tested without a database.
//
// An event here is the shape `eventForFeed()` in the event module produces:
//   { id, title, description, place, startsAt, endsAt, allDay, startDate,
//     endDate, status, url, updatedAt }
// `startsAt`/`endsAt` are ISO UTC instants; startDate/endDate are the Chicago
// calendar dates ('YYYY-MM-DD'). All-day events use the dates.
const { addDays } = require('@church-system/calendar-logic/src/dates.js');

const CRLF = '\r\n';

function escapeText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

// Lines over 75 octets are folded onto continuation lines that start with a
// space (RFC 5545 3.1). Cuts fall between characters, never inside one.
function fold(line) {
  if (Buffer.byteLength(line) <= 75) {
    return line;
  }
  const parts = [];
  let current = '';
  let limit = 75;
  for (const ch of line) {
    if (Buffer.byteLength(current + ch) > limit) {
      parts.push(current);
      current = '';
      limit = 74;
    }
    current += ch;
  }
  parts.push(current);
  return parts.join(CRLF + ' ');
}

// '2026-12-06T16:00:00.000Z' -> '20261206T160000Z'
function icsInstant(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsDate(date) {
  return date.replace(/-/g, '');
}

function eventLines(event, host, stamp) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.id}@${host}`,
    `DTSTAMP:${icsInstant(event.updatedAt || stamp)}`
  ];
  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(event.startDate)}`);
    // The end of an all-day event is exclusive.
    lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(event.endDate || event.startDate, 1))}`);
  } else {
    lines.push(`DTSTART:${icsInstant(event.startsAt)}`);
    lines.push(`DTEND:${icsInstant(event.endsAt)}`);
  }
  const cancelled = event.status === 'cancelled';
  const title = cancelled ? `CANCELLED: ${event.title}` : event.title;
  lines.push(`SUMMARY:${escapeText(title)}`);
  if (event.place) {
    lines.push(`LOCATION:${escapeText(event.place)}`);
  }
  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }
  if (event.url) {
    lines.push(`URL:${event.url}`);
  }
  lines.push(`STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`);
  lines.push('END:VEVENT');
  return lines;
}

// A whole feed. Cancelled events stay in, marked, so a subscriber's calendar
// shows the cancellation instead of silently keeping the old entry.
function buildFeed({
  name, host, events, now = new Date()
}) {
  const stamp = now.toISOString();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//church-system//events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-TIMEZONE:America/Chicago',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H'
  ];
  for (const event of events) {
    lines.push(...eventLines(event, host, stamp));
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join(CRLF) + CRLF;
}

// The "Add to Google Calendar" link for one event.
function googleCalendarUrl(event) {
  const dates = event.allDay
    ? `${icsDate(event.startDate)}/${icsDate(addDays(event.endDate || event.startDate, 1))}`
    : `${icsInstant(event.startsAt)}/${icsInstant(event.endsAt)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.status === 'cancelled' ? `CANCELLED: ${event.title}` : event.title,
    dates
  });
  if (event.place) {
    params.set('location', event.place);
  }
  const details = [ event.description, event.url ].filter(Boolean).join('\n\n');
  if (details) {
    params.set('details', details);
  }
  return `https://calendar.google.com/calendar/render?${params}`;
}

module.exports = {
  buildFeed,
  googleCalendarUrl,
  escapeText,
  fold
};
