// The full demo seed and "Reset demo" (LGC-40). Needs a database: run with
// MongoDB at APOS_MONGODB_URI (CI does).
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, destroy } = require('./helpers.js');
const demo = require('../lib/demo-data.js');
const rules = require('../lib/rules.js');

let apos;
let adminReq;
const today = rules.todayIso();

test.before(async () => {
  apos = await start();
  adminReq = apos.task.getReq();
});
test.after(async () => {
  await destroy(apos);
});

const db = () => apos.doc.db;

// What the seed made, without ids or timestamps, so two runs can be compared.
async function summary() {
  const people = await db().find({ type: 'person' }).toArray();
  const name = new Map(people.map(person => [ person._id, person.title ]));
  const households = await db().find({ type: 'household' }).toArray();
  const rosters = await db().find({ type: 'roster' }).toArray();
  const events = await db().find({ type: '@apostrophecms/event', aposMode: 'published' }).toArray();
  const weeks = await apos.tasks.weeks.find({}).sort({ _id: 1 }).toArray();
  const sorted = list => list.sort();
  return {
    people: sorted(people.map(person => [ person.title, person.dateOfBirth, person.email || '', person.status,
      person.inactiveReason || '', (person.hiddenFields || []).join(',') ].join('|'))),
    households: sorted(households.map(home => `${home.title}|${home.address && home.address.street}`)),
    groups: sorted((await db().find({ type: 'group' }).toArray())
      .map(group => `${group.title}:${sorted((group.membersIds || []).map(id => name.get(id))).join(';')}`)),
    rosters: sorted(rosters.map(doc => `${doc.month}:${doc.status}:${sorted(doc.assignments
      .map(entry => `${entry.role}/${entry.date}/${entry.slot}/${name.get(entry.person)}`)).join(';')}`)),
    events: sorted(events.map(event => `${event.title}|${event.startDate}|${event.status}|${event.publicEvent}`)),
    tasks: weeks.map(week => week.items.map(item => `${item.title}|${item.done}|${item.fromLastWeek}`).join(';'))
  };
}

test('the full seed makes the households, groups, rosters, events and tasks', async () => {
  const result = await demo.seed(apos, {
    full: true,
    reset: true
  });
  assert.equal(result.households, 45);
  assert.ok(result.people >= 135 && result.people <= 165);
  assert.equal(await db().countDocuments({ type: 'household' }), 45);
  assert.equal(await db().countDocuments({ type: 'person' }), result.people);
  const emails = (await db().find({ type: 'person', email: { $exists: true, $ne: '' } }).toArray()).map(person => person.email);
  assert.ok(emails.length > 50 && emails.every(email => email.endsWith('@example.com')));
  assert.ok(await db().findOne({ type: 'person', inactiveReason: 'deceased' }));

  // Serving roles, each with its group, and a small song-leader pool.
  const roles = await db().find({ type: 'serving-role' }).toArray();
  assert.equal(roles.length, 7);
  const songs = await db().findOne({ type: 'group', title: 'Song Leader' });
  assert.equal(songs.membersIds.length, 3);

  // Three past months and this one, all published; the song leaders uneven.
  const rosters = await db().find({ type: 'roster' }).sort({ month: 1 }).toArray();
  assert.equal(rosters.length, 4);
  assert.ok(rosters.every(doc => doc.status === 'published'));
  assert.equal(rosters.at(-1).month, today.slice(0, 7));
  const leaders = rosters.flatMap(doc => doc.assignments.filter(entry => entry.role === 'songLeader'));
  const counts = Object.values(leaders.reduce((all, entry) => ({
    ...all,
    [entry.person]: (all[entry.person] || 0) + 1
  }), {})).sort((a, b) => b - a);
  assert.ok(counts[0] / leaders.length >= 0.5, 'one person leads songs most Sundays');
  assert.ok(counts.length === 3);

  // Events: a year of history, services, one cancelled, one moved, one members-only.
  const events = await db().find({ type: '@apostrophecms/event', aposMode: 'published' }).toArray();
  assert.ok(events.some(event => event.startDate < rules.todayIso().slice(0, 4) + '-01-01' || event.startDate < today));
  const oldest = events.map(event => event.startDate).sort()[0];
  assert.ok(oldest <= `${Number(today.slice(0, 4)) - 1}-12-31` || oldest < today);
  const wednesdays = events.filter(event => event.title === 'Wednesday Bible class');
  assert.equal(wednesdays.filter(event => event.status === 'cancelled').length, 1);
  assert.equal(wednesdays.filter(event => event.status === 'changed').length, 1);
  assert.ok(events.some(event => event.publicEvent === false));
  assert.ok(wednesdays.every(event => event.regularService));
  const ics = (await apos.http.get('/calendar/public.ics', { fullResponse: true })).body;
  assert.match(ics, /SUMMARY:CANCELLED: Wednesday Bible class/);
  assert.match(ics, /SUMMARY:Sunday worship/);
  assert.doesNotMatch(ics, /Elders' meeting/);

  // Tasks: four weeks, some done, some carried over.
  const weeks = await apos.tasks.weeks.find({}).sort({ _id: 1 }).toArray();
  assert.equal(weeks.length, 4);
  assert.ok(weeks.every(week => week.items.some(item => item.done)));
  assert.ok(weeks.at(-1).items.some(item => item.fromLastWeek && !item.done), 'a carried-over item is still open');
  assert.ok(weeks.at(-1).items.some(item => !item.done));
});

test('the same seed twice gives the same content', async () => {
  await demo.seed(apos, {
    full: true,
    reset: true,
    today
  });
  const first = await summary();
  await demo.seed(apos, {
    full: true,
    reset: true,
    today
  });
  assert.deepEqual(await summary(), first);
});

async function addTester() {
  const sam = await db().findOne({ type: 'person', email: 'sam.sample@example.com' });
  assert.ok(sam, 'the hand-made sign-in people are in the full seed');
  const user = await apos.user.insert(adminReq, {
    ...apos.user.newInstance(),
    title: 'Tester',
    username: `person-${sam.aposDocId}`,
    email: 'sam.sample@example.com',
    role: 'guest',
    personId: sam._id,
    password: 'not-used-0123456789-not-used'
  });
  return {
    sam,
    user
  };
}

test('reset restores the seed, keeps accounts and the trail, and adds one entry', async () => {
  await demo.seed(apos, {
    full: true,
    reset: true,
    today
  });
  const { sam, user } = await addTester();
  const before = await summary();

  // The tester edits a person, adds a household, and the office adds an event.
  const edited = await db().findOne({ _id: sam._id });
  await apos.person.update(adminReq, {
    ...edited,
    firstName: 'Changed'
  });
  const added = await apos.household.insert(adminReq, {
    ...apos.household.newInstance(),
    title: 'Tester house'
  });
  await apos.person.insert(adminReq, {
    ...apos.person.newInstance(),
    firstName: 'Testeronly',
    lastName: 'Tester',
    dateOfBirth: '1990-01-01',
    householdIds: [ added._id ]
  });
  await db().deleteMany({ type: 'group', title: 'Song Leader' });
  assert.notDeepEqual(await summary(), before);

  const trailBefore = await apos.churchAudit.collection.countDocuments();
  const oldest = await apos.churchAudit.collection.find({}).sort({ at: 1 }).limit(1).next();
  const result = await apos.churchDemo.reset(adminReq);
  assert.equal(result.households, 45);

  assert.deepEqual(await summary(), before, 'back to the seed');
  assert.equal(await db().countDocuments({ type: 'household', title: 'Tester house' }), 0);
  assert.equal(await db().countDocuments({ type: 'person', firstName: 'Testeronly' }), 0);
  assert.equal((await db().findOne({ _id: sam._id })).firstName, 'Sam', 'same ids, so the account still finds its person');

  // The tester's account and its sign-in copy survive.
  assert.ok(await db().findOne({ _id: user._id }));
  assert.ok(await apos.db.collection('aposUsersSafe').findOne({ _id: user._id }));

  // The trail: nothing removed, one entry added, none for the seeded records.
  assert.equal(await apos.churchAudit.collection.countDocuments(), trailBefore + 1);
  assert.deepEqual((await apos.churchAudit.collection.find({}).sort({ at: 1 }).limit(1).next())._id, oldest._id);
  const entry = await apos.churchAudit.collection.find({}).sort({ at: -1 }).limit(1).next();
  assert.equal(entry.recordType, 'demo');
  assert.match(entry.changes[0].new, /Demo reset/);
});

test('reset is for office admins, and only in demo mode', async () => {
  const guest = apos.task.getReq({ role: 'guest' });
  await assert.rejects(() => apos.churchDemo.reset(guest), /forbidden/);
  const households = await db().countDocuments({ type: 'household' });
  assert.equal(households, 45);
  apos.churchDemo.options.enabled = false;
  try {
    await assert.rejects(() => apos.churchDemo.reset(adminReq), /Demo mode is off/);
    assert.equal(await db().countDocuments({ type: 'household' }), 45, 'nothing was touched');
  } finally {
    apos.churchDemo.options.enabled = true;
  }
});

test('the reset page: closed to visitors, the token and the typed word are checked', async () => {
  const anon = await apos.http.get('/demo', { fullResponse: true, originalResponse: true }).catch(error => error);
  assert.equal(anon.status, 404);
  const post = await apos.http.post('/demo/reset', {
    body: { token: 'x', confirm: 'RESET' },
    fullResponse: true,
    originalResponse: true
  }).catch(error => error);
  assert.equal(post.status, 404, 'a visitor cannot reset');
  assert.equal(await db().countDocuments({ type: 'household' }), 45);
});

test('the button: an office admin needs the page token and the typed word, then the demo is restored', async () => {
  await demo.seed(apos, {
    full: true,
    reset: true,
    today
  });
  await apos.user.insert(adminReq, {
    ...apos.user.newInstance(),
    title: 'Office',
    username: 'office-admin',
    email: 'office-admin@example.com',
    role: 'admin',
    password: 'office-password-0123456789'
  });
  const jar = apos.http.jar();
  await apos.http.post('/api/v1/@apostrophecms/login/login', {
    body: {
      username: 'office-admin',
      password: 'office-password-0123456789',
      session: true
    },
    jar
  });
  const page = await apos.http.get('/demo', { jar });
  assert.match(page, /data-demo-form/);
  assert.match(page, /data-demo-link/, 'the banner links to the page for office admins');
  // The demo form's own token: the members' toolbar has a Sign out form too.
  const token = /data-demo-form>\s*<input type="hidden" name="token" value="([^"]+)"/.exec(page)[1];
  await db().updateOne({ type: 'person', email: 'sam.sample@example.com' }, { $set: { firstName: 'Edited' } });
  const send = body => apos.http.post('/demo/reset', {
    body,
    jar,
    fullResponse: true,
    originalResponse: true
  }).catch(error => error);

  assert.equal((await send({ token: 'wrong', confirm: 'RESET' })).status, 400);
  assert.equal((await send({ token, confirm: 'reset please' })).status, 400);
  assert.equal((await db().findOne({ type: 'person', email: 'sam.sample@example.com' })).firstName, 'Edited', 'nothing reset yet');

  const done = await send({ token, confirm: 'RESET' });
  assert.equal(done.status, 200);
  assert.equal((await db().findOne({ type: 'person', email: 'sam.sample@example.com' })).firstName, 'Sam');
  assert.equal(await db().countDocuments({ type: 'household' }), 45);
});

test('a person ticked "Keep through a demo reset" survives it, with their household and sign-in', async () => {
  await demo.seed(apos, {
    full: true,
    reset: true,
    today
  });
  const house = await apos.household.insert(adminReq, {
    ...apos.household.newInstance(),
    title: 'Realtester'
  });
  const kept = await apos.person.insert(adminReq, {
    ...apos.person.newInstance(),
    firstName: 'Real',
    lastName: 'Realtester',
    email: 'real.tester@example.com',
    dateOfBirth: '1970-01-01',
    keepOnDemoReset: true,
    householdIds: [ house._id ]
  });
  const user = await apos.user.insert(adminReq, {
    ...apos.user.newInstance(),
    title: 'Real tester',
    username: `person-${kept.aposDocId || kept._id}`,
    email: 'real.tester@example.com',
    role: 'guest',
    personId: kept._id,
    password: 'not-used-0123456789-not-used'
  });
  const unticked = await apos.person.insert(adminReq, {
    ...apos.person.newInstance(),
    firstName: 'Gone',
    lastName: 'Realtester',
    dateOfBirth: '1970-01-01',
    householdIds: [ house._id ]
  });

  const result = await apos.churchDemo.reset(adminReq);
  assert.equal(result.households, 45, 'the seed still comes back beside a kept household');
  assert.ok(await db().countDocuments({ type: 'person' }) > 100);
  assert.ok(await db().findOne({ _id: kept._id }), 'the ticked person stays');
  assert.ok(await db().findOne({ _id: house._id }), 'their household stays');
  assert.ok(await db().findOne({ _id: user._id }), 'their sign-in stays');
  assert.equal(await db().countDocuments({ _id: unticked._id }), 0, 'an unticked extra person goes');

  // A tick on a seeded demo person is ignored, so the re-seed can't collide.
  const sam = await db().findOne({ type: 'person', email: 'sam.sample@example.com' });
  await db().updateOne({ _id: sam._id }, { $set: { keepOnDemoReset: true } });
  assert.equal((await apos.churchDemo.reset(adminReq)).households, 45);
  assert.notEqual((await db().findOne({ _id: sam._id })).keepOnDemoReset, true, 'Sam is made fresh');

  // The harder start-over (seed with reset) keeps them too, account included.
  await demo.seed(apos, { reset: true, today });
  assert.ok(await db().findOne({ _id: kept._id }));
  assert.ok(await db().findOne({ _id: user._id }));
});
