import { WEEKDAYS, addDays, chicagoDate, parseDate, startOfChicagoDay, toInstant } from './dates.js';

// The week (Monday 00:00 to Sunday 23:59:59.999, America/Chicago) containing an instant.
// `weekStart` is the Monday's date and identifies the week everywhere else.
export function weekOf(instant) {
  const date = chicagoDate(toInstant(instant));
  const dayIndex = (new Date(parseDate(date)).getUTCDay() + 6) % 7;
  return weekFromStart(addDays(date, -dayIndex));
}

// The week that begins on a given Monday date.
export function weekFromStart(weekStart) {
  const startsAt = startOfChicagoDay(weekStart);
  if (new Date(parseDate(weekStart)).getUTCDay() !== 1) {
    throw new RangeError(`Not a Monday: ${weekStart}`);
  }
  return {
    weekStart,
    weekEnd: addDays(weekStart, 6),
    startsAt,
    endsAt: new Date(startOfChicagoDay(addDays(weekStart, 7)).getTime() - 1)
  };
}

export function nextWeekStart(weekStart) {
  return addDays(weekFromStart(weekStart).weekStart, 7);
}

// A weekday name ("friday", any case) to its date within the week. No day, no date.
export function dueDate(weekStart, day) {
  if (day == null) {
    return null;
  }
  const index = WEEKDAYS.indexOf(String(day).toLowerCase());
  if (index < 0) {
    throw new RangeError(`Not a weekday: ${day}`);
  }
  return addDays(weekFromStart(weekStart).weekStart, index);
}
