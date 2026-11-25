// Dates as people read them, in the visitor's locale (Gary, 2026-11-25: "dates
// should be localized in the UX everywhere"). Templates use the churchDate
// filter: {{ item.dueDate | churchDate('short', data.locale) }}.
//
// A plain date (YYYY-MM-DD) or month (YYYY-MM) is a calendar day, not an
// instant, so it is read at noon UTC and shown in UTC: it never shifts a day.
// A full timestamp is shown in the church's time zone.

const STYLES = {
  long: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }, // Sunday, November 29, 2026
  medium: { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }, // Sun, Nov 29, 2026
  short: { weekday: 'short', month: 'short', day: 'numeric' }, // Sun, Nov 29
  month: { year: 'numeric', month: 'long' } // November 2026
};

function formatDate(value, style = 'medium', locale = 'en', timeZone = 'America/Chicago') {
  if (!value) {
    return '';
  }
  const options = STYLES[style] || STYLES.medium;
  let date;
  let zone = timeZone;
  if (typeof value === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(value)) {
    date = new Date(`${value.length === 7 ? `${value}-01` : value}T12:00:00Z`);
    zone = 'UTC';
  } else {
    date = new Date(value);
  }
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  try {
    return new Intl.DateTimeFormat(locale || 'en', { ...options, timeZone: zone }).format(date);
  } catch (e) {
    return new Intl.DateTimeFormat('en', { ...options, timeZone: zone }).format(date);
  }
}

module.exports = { formatDate, STYLES };
