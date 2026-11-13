import { addDays, localToInstant, parseDate, toMs } from './dates.js';

// Events for a print date ('YYYY-MM-DD', Chicago): announced by the end of that
// day and starting within the next 14 days (the print date's midnight up to
// 14 days later). Event: { startsAt, announceFrom, isRegularService, status,
// inBulletin? }. Regular services appear only when cancelled or changed
// (moved); `inBulletin: false` is the office unticking an event. Cancelled
// events are kept so the bulletin can say so. Public and members-only both.
export function bulletinEvents(events, printDate) {
  parseDate(printDate);
  const from = localToInstant(printDate, '00:00');
  const to = localToInstant(addDays(printDate, 14), '00:00');
  const announcedBy = localToInstant(addDays(printDate, 1), '00:00');
  return events
    .filter((e) => {
      const start = toMs(e.startsAt);
      return (
        e.inBulletin !== false &&
        toMs(e.announceFrom) < announcedBy &&
        start >= from &&
        start < to &&
        (!e.isRegularService || e.status === 'cancelled' || e.status === 'changed')
      );
    })
    .sort((a, b) => toMs(a.startsAt) - toMs(b.startsAt));
}

