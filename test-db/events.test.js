// Needs a database: run with MongoDB at APOS_MONGODB_URI (CI does).
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, destroy } = require('./helpers.js');

let apos;
let req;
let event;

test.before(async () => {
  apos = await start();
  req = apos.task.getReq({ mode: 'draft' });
  event = apos.event;
});
test.after(async () => {
  await destroy(apos);
});

const base = {
  title: 'Test',
  startDate: '2027-01-03',
  startTime: '10:00:00',
  endTime: '11:00:00',
  dateType: 'single'
};

test('boots with the church fields and the module is aliased', async () => {
  assert.ok(event);
  assert.ok(event.schema.find(f => f.name === 'regularService'));
  assert.ok(!event.schema.find(f => f.name === 'repeatInterval'));
  assert.equal(apos.i18n.namespaces.church.browser, true);
});

test('a single event: Chicago time, public by default', async () => {
  const piece = await event.insert(req, {
    ...event.newInstance(),
    ...base
  });
  // 10:00 in Chicago in January is 16:00Z, whatever the server's time zone.
  assert.equal(piece.start.toISOString(), '2027-01-03T16:00:00.000Z');
  assert.equal(piece.end.toISOString(), '2027-01-03T17:00:00.000Z');
  assert.equal(piece.visibility, 'public');
  assert.equal(piece.status, 'scheduled');
});

async function all(group, mode = 'draft') {
  return apos.doc.db.find({
    type: '@apostrophecms/event',
    aposMode: mode,
    eventGroupId: group
  }).sort({ start: 1 }).toArray();
}

test('a weekly series of 4 is four records, with the group link, and publishes together', async () => {
  const parent = await event.insert(req, {
    ...event.newInstance(),
    ...base,
    title: 'Weekly',
    dateType: 'repeat',
    repeatPattern: 'weekly',
    repeatEnds: 'count',
    repeatCount: 4
  });
  assert.ok(parent.eventGroupId);
  const drafts = await all(parent.eventGroupId);
  assert.deepEqual(drafts.map(d => d.startDate), [ '2027-01-03', '2027-01-10', '2027-01-17', '2027-01-24' ]);
  assert.deepEqual(drafts.map(d => Boolean(d.isClone)), [ false, true, true, true ]);
  // 10:00 stays 10:00 across the March change: not in this range, so check one in summer below.
  await event.publish(req, parent);
  const published = await all(parent.eventGroupId, 'published');
  assert.equal(published.length, 4);
  assert.ok(published.every(p => p.eventGroupId === parent.eventGroupId), 'group link survives publishing');
  assert.equal(published.filter(p => p.isClone).length, 3);
});

test('monthly on the nth weekday: the first Sunday, and the last one', async () => {
  const first = await event.insert(req, {
    ...event.newInstance(),
    ...base,
    title: 'First Sunday meal',
    startDate: '2027-01-03',
    dateType: 'repeat',
    repeatPattern: 'nth-weekday',
    repeatEnds: 'count',
    repeatCount: 3
  });
  assert.deepEqual((await all(first.eventGroupId)).map(d => d.startDate), [ '2027-01-03', '2027-02-07', '2027-03-07' ]);
  // 2027-01-31 is a 5th Sunday: it means the last Sunday.
  const last = await event.insert(req, {
    ...event.newInstance(),
    ...base,
    title: 'Last Sunday',
    startDate: '2027-01-31',
    dateType: 'repeat',
    repeatPattern: 'nth-weekday',
    repeatEnds: 'count',
    repeatCount: 3
  });
  assert.deepEqual((await all(last.eventGroupId)).map(d => d.startDate), [ '2027-01-31', '2027-02-28', '2027-03-28' ]);
});

test('wall-clock time holds across daylight saving', async () => {
  const parent = await event.insert(req, {
    ...event.newInstance(),
    ...base,
    title: 'Over the clocks',
    startDate: '2027-03-07',
    dateType: 'repeat',
    repeatPattern: 'weekly',
    repeatEnds: 'count',
    repeatCount: 2
  });
  // Clocks went forward on 14 March 2027.
  assert.deepEqual((await all(parent.eventGroupId)).map(d => d.start.toISOString()), [
    '2027-03-07T16:00:00.000Z',
    '2027-03-14T15:00:00.000Z'
  ]);
});

test('an event with an end date makes a series that stops on it', async () => {
  const parent = await event.insert(req, {
    ...event.newInstance(),
    ...base,
    title: 'Until',
    dateType: 'repeat',
    repeatPattern: 'weekly',
    repeatEnds: 'until',
    repeatUntil: '2027-01-17'
  });
  assert.equal((await all(parent.eventGroupId)).length, 3);
});

test('an open-ended series is filled a year ahead, and the top-up is safe to repeat', async () => {
  const parent = await event.insert(req, {
    ...event.newInstance(),
    ...base,
    title: 'Sunday worship',
    startDate: '2027-01-03',
    dateType: 'repeat',
    repeatPattern: 'weekly',
    repeatEnds: 'never',
    regularService: true
  });
  await event.publish(req, parent);
  const before = (await all(parent.eventGroupId)).length;
  assert.ok(before >= 40, `filled ahead: ${before}`);
  assert.equal(await event.topUpSeries(req, { today: rulesToday() }), 0, 'already filled');
  // A month later the series needs another month's Sundays.
  const later = addDaysIso(rulesToday(), 35);
  const created = await event.topUpSeries(req, { today: later });
  assert.ok(created >= 4 && created <= 6, `created ${created}`);
  assert.equal(await event.topUpSeries(req, { today: later }), 0, 'second run creates nothing');
  const published = await all(parent.eventGroupId, 'published');
  assert.equal(published.length, before + created, 'new occurrences are published with the series');
  assert.ok(published.every(p => p.regularService === true));
});

function rulesToday() {
  return require('../lib/rules.js').todayIso();
}
function addDaysIso(date, n) {
  return require('@church-system/calendar-logic/src/dates.js').addDays(date, n);
}

test('a cancelled or moved occurrence is not made again by the top-up', async () => {
  const parent = await event.insert(req, {
    ...event.newInstance(),
    ...base,
    title: 'Wednesday class',
    startDate: '2027-01-06',
    dateType: 'repeat',
    repeatPattern: 'weekly',
    repeatEnds: 'never'
  });
  const drafts = await all(parent.eventGroupId);
  await event.editSeries(req, drafts[3]._id, 'this', { status: 'cancelled' });
  await event.editSeries(req, drafts[4]._id, 'this', { startDate: '2027-02-04' });
  const moved = (await all(parent.eventGroupId)).find(d => d._id === drafts[4]._id);
  assert.equal(moved.status, 'changed');
  assert.equal(moved.ruleDate, drafts[4].ruleDate, 'keeps the date the rule gave it');
  const count = (await all(parent.eventGroupId)).length;
  await event.topUpSeries(req, { today: rulesToday() });
  assert.equal((await all(parent.eventGroupId)).length, count);
});

test('"this one only" and "this and all after"', async () => {
  const parent = await event.insert(req, {
    ...event.newInstance(),
    ...base,
    title: 'Class',
    dateType: 'repeat',
    repeatPattern: 'weekly',
    repeatEnds: 'count',
    repeatCount: 5
  });
  const drafts = await all(parent.eventGroupId);
  // One only: the third gets a new place.
  await event.editSeries(req, drafts[2]._id, 'this', { place: 'Fellowship hall' });
  let now = await all(parent.eventGroupId);
  assert.deepEqual(now.map(d => d.place || ''), [ '', '', 'Fellowship hall', '', '' ]);
  assert.equal(now[2].status, 'changed');
  // This and all after: from the third, a new title and a later time.
  await event.editSeries(req, drafts[2]._id, 'following', {
    title: 'Class (new time)',
    startTime: '10:30:00',
    endTime: '11:30:00',
    startDate: '2030-01-01'
  });
  now = await all(parent.eventGroupId);
  assert.deepEqual(now.map(d => d.title), [ 'Class', 'Class', 'Class (new time)', 'Class (new time)', 'Class (new time)' ]);
  assert.deepEqual(now.map(d => d.startDate), [ '2027-01-03', '2027-01-10', '2027-01-17', '2027-01-24', '2027-01-31' ], 'dates are never moved for a whole series');
  assert.equal(now[3].start.toISOString(), '2027-01-24T16:30:00.000Z');
  assert.equal(JSON.parse(now[4].seriesRule).time, '10:30');
  assert.equal(JSON.parse(now[0].seriesRule).time, '10:00');
});

test('a members-only event is login-required and hidden from anonymous queries', async () => {
  const piece = await event.insert(req, {
    ...event.newInstance(),
    ...base,
    title: 'Members night',
    publicEvent: false
  });
  await event.publish(req, piece);
  const anon = apos.task.getAnonReq({ mode: 'published' });
  const guest = apos.task.getReq({
    role: 'guest',
    mode: 'published'
  });
  assert.equal(await event.find(anon, { title: 'Members night' }).toCount(), 0);
  assert.equal(await event.find(guest, { title: 'Members night' }).toCount(), 1);
});

test('the edit-series API route needs an editor and works for "this and all after"', async () => {
  const parent = await event.insert(req, {
    ...event.newInstance(),
    ...base,
    title: 'API series',
    dateType: 'repeat',
    repeatPattern: 'weekly',
    repeatEnds: 'count',
    repeatCount: 3
  });
  const drafts = await all(parent.eventGroupId);
  const url = id => `/api/v1/@apostrophecms/event/${id}/edit-series`;
  // Not signed in: refused.
  await assert.rejects(
    apos.http.post(url(drafts[1]._id), {
      body: {
        scope: 'following',
        changes: { title: 'X' }
      }
    }),
    e => e.status === 403 || e.status === 401
  );
  await apos.user.insert(req, {
    ...apos.user.newInstance(),
    title: 'Office',
    username: 'office-admin',
    email: 'office@example.com',
    role: 'admin',
    password: 'a-long-test-password-2'
  });
  const jar = apos.http.jar();
  await apos.http.post('/api/v1/@apostrophecms/login/login', {
    jar,
    body: {
      username: 'office-admin',
      password: 'a-long-test-password-2',
      session: true
    }
  });
  // A page view sets the CSRF cookie, as it does for a browser.
  await apos.http.get('/', { jar }).catch(() => null);
  const result = await apos.http.post(url(drafts[1]._id), {
    jar,
    body: {
      scope: 'following',
      changes: {
        title: 'API series (renamed)',
        // Ignored: not an editable field.
        slug: 'hacked'
      }
    }
  });
  assert.equal(result.changed.length, 2);
  const now = await all(parent.eventGroupId);
  assert.deepEqual(now.map(d => d.title), [ 'API series', 'API series (renamed)', 'API series (renamed)' ]);
  assert.ok(now.every(d => d.slug !== 'hacked'));
});

test('the contact person\'s name is kept on the event for members to see', async () => {
  const { makeHousehold, makePerson } = require('./helpers.js');
  const household = await makeHousehold(apos, req);
  const person = await makePerson(apos, req, household, {
    firstName: 'Ruth',
    lastName: 'Jones',
    preferredName: 'Ruthie'
  });
  const piece = await event.insert(req, {
    ...event.newInstance(),
    ...base,
    title: 'With contact',
    _contact: [ person ]
  });
  assert.equal(piece.contactName, 'Ruthie Jones');
  const cleared = await event.update(req, {
    ...piece,
    _contact: []
  });
  assert.equal(cleared.contactName, '');
});

test('a "this one only" edit of the newest occurrence is not copied by the top-up', async () => {
  const parent = await event.insert(req, {
    ...event.newInstance(),
    ...base,
    title: 'Wednesday class',
    place: 'Auditorium',
    startDate: '2027-01-06',
    dateType: 'repeat',
    repeatPattern: 'weekly',
    repeatEnds: 'never'
  });
  const before = await all(parent.eventGroupId);
  const newest = before.sort((a, b) => (a.ruleDate < b.ruleDate ? 1 : -1))[0];
  await event.editSeries(req, newest._id, 'this', {
    place: 'Fellowship hall',
    title: 'Wednesday class: guest teacher'
  });
  // The count covers every series in the database, so count this one's own.
  await event.topUpSeries(req, { today: addDaysIso(rulesToday(), 35) });
  const after = await all(parent.eventGroupId);
  const fresh = after.filter(o => o.ruleDate > newest.ruleDate);
  assert.ok(fresh.length >= 4, `created ${fresh.length}`);
  assert.equal(after.length, before.length + fresh.length);
  for (const o of fresh) {
    assert.equal(o.place, 'Auditorium', `${o.ruleDate} keeps the series' place`);
    assert.equal(o.title, 'Wednesday class', `${o.ruleDate} keeps the series' title`);
    assert.notEqual(o.seriesException, true);
  }
  const edited = after.find(o => o._id === newest._id);
  assert.equal(edited.seriesException, true);
  assert.equal(edited.place, 'Fellowship hall');
});
