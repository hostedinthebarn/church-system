# roster-logic

Pure, database-free suggested rotation for the servers roster. The rules are at the top of `src/roster.js`.

```js
import { suggestRoster } from '@church-system/roster-logic';
const { assignments, warnings } = suggestRoster({ month: '2026-12', roles, away, history });
```

Beyond the suggestion (`src/manage.js`):

- `checkRoster`: warnings on an adjusted roster (empty slot, same person twice, two roles on a Sunday, away).
- `swapSlot`, `diffAssignments`: one slot changed, and which slots changed hands (who to email).
- `layoutRoster`, `layoutText`, `dutiesOf`: the printable list, the monthly email and a person's own duties.
- `awaySundays`: away spans to the per-Sunday list `suggestRoster` takes.
- `rosterConditions`: the weekly tasks list's "next month's roster" item, from two weeks before the month starts until it is published (shape for `syncSystemItems`).

`npm test` runs the tests and fails below 100% line, branch and function coverage.
