# roster-logic

Pure, database-free suggested rotation for the servers roster. The rules are at the top of `src/roster.js`.

```js
import { suggestRoster } from '@church-system/roster-logic';
const { assignments, warnings } = suggestRoster({ month: '2026-12', roles, away, history });
```

`npm test` runs the tests and fails below 100% line, branch and function coverage.
