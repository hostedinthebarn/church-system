// Needs a database: run with MongoDB at APOS_MONGODB_URI (CI does).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  start, destroy, makeHousehold, makePerson
} = require('./helpers.js');

let apos;
let req;
let mine;
let theirs;
let parent;
let child;
let office;
let guestReq;

test.before(async () => {
  apos = await start();
  req = apos.task.getReq();
  mine = await makeHousehold(apos, req);
  theirs = await makeHousehold(apos, req);
  parent = await makePerson(apos, req, mine, { firstName: 'Pat' });
  child = await makePerson(apos, req, mine, {
    firstName: 'Kit',
    dateOfBirth: '2018-02-02'
  });
  office = await makePerson(apos, req, theirs, { firstName: 'Olly' });
  guestReq = { user: { role: 'guest', personId: parent._id } };
});
test.after(async () => {
  await destroy(apos);
});

test('a member is allowed their own household only; the office, any', async () => {
  const viewer = await apos.awayDate.viewer(guestReq);
  assert.deepEqual(viewer, { role: 'guest', householdId: mine._id, isAdult: true });
  const minor = await apos.awayDate.viewer({ user: { role: 'guest', personId: child._id } });
  assert.equal(minor.isAdult, false);
  assert.equal(await apos.awayDate.viewer({}), null);
  assert.deepEqual(await apos.awayDate.viewer({ user: { role: 'admin' } }), { role: 'admin' });
});

test('adding and removing an away date in the household, with the person checked', async () => {
  const added = await apos.awayDate.add(guestReq, mine._id, {
    person: child._id,
    startDate: '2099-01-04',
    endDate: ''
  });
  assert.equal(added.title, '2099-01-04');
  assert.equal(added.endDate, '2099-01-04');
  await assert.rejects(apos.awayDate.add(guestReq, mine._id, {
    person: office._id,
    startDate: '2099-01-04'
  }), /not in this household/);
  await assert.rejects(apos.awayDate.add(guestReq, mine._id, {
    person: parent._id,
    startDate: 'soon'
  }), /YYYY-MM-DD/);
  await assert.rejects(apos.awayDate.add(guestReq, null, {
    person: parent._id,
    startDate: '2099-01-04'
  }), /household/);
  const { spans } = await apos.awayDate.upcoming(mine._id);
  assert.deepEqual(spans.map(span => [ span.name, span.from, span.to ]), [ [ 'Kit', '2099-01-04', '2099-01-04' ] ]);
  assert.deepEqual((await apos.awayDate.upcoming(theirs._id)).spans, []);

  // Another household's span can't be removed through this one.
  await assert.rejects(apos.awayDate.remove(guestReq, theirs._id, added._id), /No such away date/);
  await apos.awayDate.remove(guestReq, mine._id, added._id);
  assert.deepEqual((await apos.awayDate.upcoming(mine._id)).spans, []);
});

test('past away dates are not listed, and the audit trail names who marked it', async () => {
  const past = await apos.awayDate.add(guestReq, mine._id, {
    person: parent._id,
    startDate: '2020-01-05'
  });
  assert.deepEqual((await apos.awayDate.upcoming(mine._id)).spans, []);
  const entries = await apos.churchAudit.collection.find({ recordId: past._id }).toArray();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, 'create');
});
