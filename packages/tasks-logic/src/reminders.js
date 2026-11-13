// The morning reminder emails. `people` maps an owner id to { email, reminders } where
// `reminders: false` means they turned them off. No owner, or an owner with no address on
// file, goes to the office address. One email per address per day: everything of theirs
// that is due today or overdue is listed in it. `alreadySent` (addresses mailed today)
// makes a re-run harmless.
export function remindersFor({ items, today, people = {}, officeAddress, alreadySent = [] }) {
  const sent = new Set(alreadySent);
  const byAddress = new Map();
  for (const item of items) {
    if (item.done || item.dueDate == null || item.dueDate > today) {
      continue;
    }
    const person = item.owner == null ? undefined : people[item.owner];
    if (person?.reminders === false) {
      continue;
    }
    const to = person?.email ?? officeAddress;
    if (!byAddress.has(to)) {
      byAddress.set(to, []);
    }
    byAddress.get(to).push(item);
  }
  return [...byAddress]
    .filter(([to]) => !sent.has(to))
    .map(([to, due]) => ({
      to,
      items: due.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title))
    }))
    .sort((a, b) => a.to.localeCompare(b.to));
}
