import { DAY_MS, toMs } from './dates.js';

// When an event is first announced (Facebook and bulletin), as an ISO instant.
// Default: 14 days before the start, or `now` if that moment has passed. An
// explicit date from the office always wins, earlier or later.
export function announceFrom(startsAt, now, explicit) {
  if (explicit !== undefined && explicit !== null) {
    return new Date(toMs(explicit)).toISOString();
  }
  return new Date(Math.max(toMs(startsAt) - 14 * DAY_MS, toMs(now))).toISOString();
}
