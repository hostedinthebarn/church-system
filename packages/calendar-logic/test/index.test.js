import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';

test('public API', () => {
  for (const name of ['expandRule', 'nthWeekdayOfMonth', 'occurrencesToChange', 'topUp',
    'announceFrom', 'bulletinEvents', 'facebookAction', 'localToInstant', 'instantToLocal']) {
    assert.equal(typeof api[name], 'function', name);
  }
  assert.equal(api.TZ, 'America/Chicago');
});
