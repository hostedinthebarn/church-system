// Needs a database: run with MongoDB at APOS_MONGODB_URI (CI does).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  start, destroy, makeHousehold, makePerson, auditFor
} = require('./helpers.js');

let apos;
let req;

test.before(async () => {
  apos = await start();
  req = apos.task.getReq();
});
test.after(async () => {
  await destroy(apos);
});

test('a person belongs to a household, and the household name follows its adults', async () => {
  const household = await makeHousehold(apos, req);
  await makePerson(apos, req, household, {
    firstName: 'Gary',
    lastName: 'Bailey'
  });
  const shannon = await makePerson(apos, req, household, {
    firstName: 'Shannon',
    lastName: 'Bailey'
  });
  assert.equal(shannon.title, 'Bailey, Shannon');
  const after = await apos.household.find(req, { _id: household._id }).toObject();
  assert.equal(after.title, 'Bailey, Gary & Shannon');
});

test('a household the office has renamed by hand keeps its name', async () => {
  const household = await makeHousehold(apos, req, {
    title: 'The Fox den',
    autoName: false
  });
  await makePerson(apos, req, household, {
    firstName: 'Fay',
    lastName: 'Fox'
  });
  const after = await apos.household.find(req, { _id: household._id }).toObject();
  assert.equal(after.title, 'The Fox den');
});

test('an email belongs to one person only', async () => {
  const household = await makeHousehold(apos, req);
  await makePerson(apos, req, household, { email: 'Same@Example.com' });
  await assert.rejects(
    makePerson(apos, req, household, {
      firstName: 'Lee',
      email: 'same@example.com'
    }),
    /already belongs/
  );
});

test('a person is made inactive, not deleted, and can be restored', async () => {
  const household = await makeHousehold(apos, req);
  const person = await makePerson(apos, req, household, { email: 'back@example.com' });
  person.inactiveReason = 'moved';
  await apos.person.update(req, person);
  let saved = await apos.person.find(req, { _id: person._id }).toObject();
  assert.equal(saved.inactiveReason, 'moved');
  saved.inactiveReason = '';
  await apos.person.update(req, saved);
  saved = await apos.person.find(req, { _id: person._id }).toObject();
  assert.equal(saved.inactiveReason, '');
});

test('the audit trail records creates, changes and deletes with old and new values', async () => {
  const household = await makeHousehold(apos, req);
  const person = await makePerson(apos, req, household, { cellphone: '555-0100' });
  person.cellphone = '555-0199';
  await apos.person.update(req, person);
  await apos.person.delete(req, person);

  const entries = await auditFor(apos, person._id);
  assert.deepEqual(entries.map(entry => entry.action), [ 'create', 'update', 'delete' ]);
  const update = entries[1].changes.find(change => change.field === 'cellphone');
  assert.deepEqual([ update.old, update.new ], [ '555-0100', '555-0199' ]);
  const deleted = entries[2].changes.find(change => change.field === 'cellphone');
  assert.deepEqual([ deleted.old, deleted.new ], [ '555-0199', null ]);
  assert.ok(entries[0].at instanceof Date);
  assert.equal(entries[0].recordType, 'person');
});

test('a save that changes nothing writes no audit entry', async () => {
  const household = await makeHousehold(apos, req);
  const person = await makePerson(apos, req, household);
  const fresh = await apos.person.find(req, { _id: person._id }).toObject();
  await apos.person.update(req, fresh);
  assert.equal((await auditFor(apos, person._id)).length, 1);
});

test('only office admins read the audit trail', async () => {
  const entries = await apos.churchAudit.list(req, { limit: 5 });
  assert.ok(entries.length > 0);
  await assert.rejects(apos.churchAudit.list(apos.task.getAnonReq()), error => error.name === 'forbidden');
});

test('a forget request blanks the old and new values but keeps the entries', async () => {
  const household = await makeHousehold(apos, req);
  const person = await makePerson(apos, req, household, { email: 'gone@example.com' });
  const count = await apos.churchAudit.forgetPerson(person._id);
  assert.ok(count >= 1);
  const entries = await auditFor(apos, person._id);
  assert.ok(entries.length >= 1);
  for (const entry of entries) {
    assert.equal(entry.redacted, true);
    for (const change of entry.changes) {
      assert.ok(change.old === null || change.old === '[deleted at request]');
      assert.ok(change.new === null || change.new === '[deleted at request]');
    }
  }
  assert.doesNotMatch(JSON.stringify(entries), /gone@example\.com/);
});

test('relationships: a person can\'t relate to themself, and only spouses carry an anniversary', async () => {
  const household = await makeHousehold(apos, req);
  const a = await makePerson(apos, req, household, { firstName: 'Ann' });
  const b = await makePerson(apos, req, household, { firstName: 'Bo' });
  const base = () => ({
    ...apos.personRelationship.newInstance(),
    personAIds: [ a._id ],
    personBIds: [ b._id ]
  });
  await assert.rejects(
    apos.personRelationship.insert(req, {
      ...base(),
      kind: 'spouse',
      personBIds: [ a._id ]
    }),
    /themself/
  );
  const spouse = await apos.personRelationship.insert(req, {
    ...base(),
    kind: 'spouse',
    anniversary: '2005-06-04'
  });
  assert.equal(spouse.anniversary, '2005-06-04');
  const guardian = await apos.personRelationship.insert(req, {
    ...base(),
    kind: 'guardian',
    anniversary: '2005-06-04'
  });
  assert.equal(guardian.anniversary, null);
});

test('groups have a type and members', async () => {
  const household = await makeHousehold(apos, req);
  const person = await makePerson(apos, req, household);
  const group = await apos.group.insert(req, {
    ...apos.group.newInstance(),
    title: 'Greeters',
    groupType: 'serving',
    membersIds: [ person._id ]
  });
  const found = await apos.group.find(req, { _id: group._id }).relationships(true).toObject();
  assert.equal(found.groupType, 'serving');
  assert.deepEqual(found.membersIds, [ person._id ]);
});

test('office notes are add-only, can be struck through, and can be ticked as a contact', async () => {
  const household = await makeHousehold(apos, req);
  const person = await makePerson(apos, req, household);
  const note = await apos.officeNote.insert(req, {
    ...apos.officeNote.newInstance(),
    text: 'Called after surgery',
    personIds: [ person._id ],
    contacted: true,
    contactDate: '2026-11-10'
  });
  assert.equal(note.struck, false);
  assert.ok(note.authorName);

  const saved = await apos.officeNote.find(req, { _id: note._id }).toObject();
  saved.text = 'Rewritten';
  await assert.rejects(apos.officeNote.update(req, saved), /only be added to/);

  const again = await apos.officeNote.find(req, { _id: note._id }).toObject();
  again.struck = true;
  await apos.officeNote.update(req, again);
  const struck = await apos.officeNote.find(req, { _id: note._id }).toObject();
  assert.equal(struck.struck, true);
  assert.equal(struck.text, 'Called after surgery');

  await assert.rejects(apos.officeNote.delete(req, struck), /never deleted/);
});

test('an office note is about one person or one household, not both or neither', async () => {
  const household = await makeHousehold(apos, req);
  const person = await makePerson(apos, req, household);
  const base = () => ({
    ...apos.officeNote.newInstance(),
    text: 'x'
  });
  await assert.rejects(apos.officeNote.insert(req, base()), /one person or one household/);
  await assert.rejects(apos.officeNote.insert(req, {
    ...base(),
    personIds: [ person._id ],
    householdIds: [ household._id ]
  }), /one person or one household/);
  await apos.officeNote.insert(req, {
    ...base(),
    householdIds: [ household._id ]
  });
});

test('away dates: the last day can\'t be before the first, and a single day needs no end', async () => {
  const household = await makeHousehold(apos, req);
  const person = await makePerson(apos, req, household);
  const make = extra => apos.awayDate.insert(req, {
    ...apos.awayDate.newInstance(),
    personIds: [ person._id ],
    ...extra
  });
  await assert.rejects(make({
    startDate: '2026-12-10',
    endDate: '2026-12-01'
  }), /before the first/);
  const single = await make({ startDate: '2026-12-10' });
  assert.equal(single.endDate, '2026-12-10');
});

test('people are office-only: an anonymous request can\'t view or edit them', async () => {
  const anon = apos.task.getAnonReq();
  assert.equal(apos.permission.can(anon, 'view', 'person'), false);
  assert.equal(apos.permission.can(anon, 'edit', 'person'), false);
  assert.equal(apos.permission.can(anon, 'view', 'office-note'), false);
  const guest = apos.task.getGuestReq();
  assert.equal(apos.permission.can(guest, 'view', 'person'), false);
  assert.equal(apos.permission.can(guest, 'edit', 'household'), false);
});
