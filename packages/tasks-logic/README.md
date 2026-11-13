# @church-system/tasks-logic

Pure logic for the weekly tasks list (LGC-38). No database, no I/O, no dependencies. Spec: the vault's `weekly-tasks-poc` note.

- `weekOf(instant)`, `weekFromStart(monday)`: Monday 00:00 to Sunday 23:59:59.999, America/Chicago, DST-safe. Weeks are identified by their Monday date.
- `dueDate(weekStart, 'friday')`: a weekday name to a date in that week.
- `buildWeek({ weekStart, templateVersions, previousItems, oneOffs })`: template as it stood at the week's start, unticked items carried over ("from last week"), one-offs.
- `tickItem(items, id, { by, at })`: manual tick; closes system items too.
- `syncSystemItems(items, conditions, at)`: adds system items for live conditions, ticks cleared ones "resolved by the system".
- `remindersFor({ items, today, people, officeAddress, alreadySent })`: one email per address per morning, due-today-or-overdue items, no owner to the office, reminders-off skipped.

`npm test` runs node:test under c8 and fails below 100% lines, branches, functions and statements.
