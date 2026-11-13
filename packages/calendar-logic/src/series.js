import { addMonths, parseDate } from './dates.js';
import { expandRule } from './repeat.js';

// "This one only" / "this and all after". `occurrences` is a series' records
// (each with an `id` and `startsAt`); the edit is made at the occurrence with
// id `atId`. Returns the occurrences the edit changes, in start order.
export function occurrencesToChange(occurrences, atId, scope) {
  const sorted = [...occurrences].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const at = sorted.findIndex((o) => o.id === atId);
  if (at === -1) {
    throw new RangeError(`No occurrence with id "${atId}" in this series`);
  }
  if (scope === 'this') {
    return [sorted[at]];
  }
  if (scope === 'following') {
    return sorted.slice(at);
  }
  throw new RangeError(`Unknown scope "${scope}", expected "this" or "following"`);
}

// The occurrences to create so an open-ended series is filled `months` ahead
// of `today` (a date). `existingDates` are the rule dates the series already
// has, including cancelled ones; a moved occurrence must still report the date
// the rule gave it, or it would be created again. Never creates anything dated
// before today, so running it twice (or nightly) creates nothing new.
export function topUp(rule, existingDates, today, months = 12) {
  parseDate(today);
  const have = new Set(existingDates);
  return expandRule(rule, addMonths(today, months)).filter(
    (o) => o.date >= today && !have.has(o.date)
  );
}
