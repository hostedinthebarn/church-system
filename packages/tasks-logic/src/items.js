import { dueDate, weekFromStart } from './week.js';

// An item: { id, title, kind: 'template'|'one-off'|'system', owner, dueDate,
//   fromLastWeek, sourceKey, done, doneBy, doneAt, resolvedBySystem }

function openItem(fields) {
  return {
    id: fields.id,
    title: fields.title,
    kind: fields.kind,
    owner: fields.owner ?? null,
    dueDate: fields.dueDate ?? null,
    fromLastWeek: fields.fromLastWeek ?? false,
    sourceKey: fields.sourceKey ?? null,
    done: false,
    doneBy: null,
    doneAt: null,
    resolvedBySystem: false
  };
}

// The template as it stood at an instant: the latest version taking effect at or before it.
// A version is { effectiveFrom, items: [{ key, title, day, owner }] }. An edit made during
// a week therefore only shows from the next week's start.
export function templateAsOf(versions, instant) {
  const at = new Date(instant).getTime();
  const current = versions
    .filter((version) => new Date(version.effectiveFrom).getTime() <= at)
    .sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom))
    .at(-1);
  return current ? current.items : [];
}

// A new week's list: template items (from the week's start), last week's unticked items
// marked "from last week" (keeping their due dates, so they show as overdue), and one-offs.
export function buildWeek({ weekStart, templateVersions = [], previousItems = [], oneOffs = [] }) {
  const week = weekFromStart(weekStart);
  const fromTemplate = templateAsOf(templateVersions, week.startsAt).map((entry) =>
    openItem({
      id: `${weekStart}:template:${entry.key}`,
      title: entry.title,
      kind: 'template',
      owner: entry.owner,
      dueDate: dueDate(weekStart, entry.day)
    })
  );
  const carried = previousItems
    .filter((item) => !item.done)
    .map((item) => ({ ...item, fromLastWeek: true }));
  const added = oneOffs.map((entry, index) =>
    openItem({
      id: entry.id ?? `${weekStart}:one-off:${index + 1}`,
      title: entry.title,
      kind: 'one-off',
      owner: entry.owner,
      dueDate: dueDate(weekStart, entry.day)
    })
  );
  return [...fromTemplate, ...carried, ...added];
}

// A manual tick closes any item, system items included. Ticking a closed item changes nothing.
export function tickItem(items, id, { by, at }) {
  if (!items.some((item) => item.id === id)) {
    throw new RangeError(`No such item: ${id}`);
  }
  return items.map((item) =>
    item.id !== id || item.done
      ? item
      : { ...item, done: true, doneBy: by, doneAt: new Date(at).toISOString(), resolvedBySystem: false }
  );
}

// Brings the system items in line with the conditions currently true.
// `conditions` is [{ sourceKey, title, owner, dueDate }]: one per live problem (a failed
// Facebook post, an event with no image). A condition with no item yet adds one, unless the
// list already has an item for that source, even a ticked one (the office accepted it as is).
// An open system item whose condition has cleared is ticked "resolved by the system".
export function syncSystemItems(items, conditions, at) {
  const live = new Set(conditions.map((condition) => condition.sourceKey));
  const known = new Set(items.filter((item) => item.kind === 'system').map((item) => item.sourceKey));
  const resolved = items.map((item) =>
    item.kind === 'system' && !item.done && !live.has(item.sourceKey)
      ? { ...item, done: true, doneBy: null, doneAt: new Date(at).toISOString(), resolvedBySystem: true }
      : item
  );
  const created = conditions
    .filter((condition) => !known.has(condition.sourceKey))
    .map((condition) =>
      openItem({
        id: `system:${condition.sourceKey}`,
        title: condition.title,
        kind: 'system',
        owner: condition.owner,
        dueDate: condition.dueDate,
        sourceKey: condition.sourceKey
      })
    );
  return [...resolved, ...created];
}
