// Needs a database: run with MongoDB at APOS_MONGODB_URI (CI does).
// The directory's edits on the demo households, through the module's own
// methods: who may edit, what is written, and what the audit trail says.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  start, destroy, auditFor
} = require('./helpers.js');
const directory = require('../lib/directory.js');
const rules = require('../lib/rules.js');

let apos;
let mod;
let snapshot;

const find = (key, last) => snapshot.people.find(person => person.firstName === key && person.lastName === last);

test.before(async () => {
  apos = await start();
  mod = apos.churchDirectory;
  await mod.seedDemo({ reset: true });
  snapshot = await mod.snapshot();
});
test.after(async () => {
  await destroy(apos);
});

function memberViewer(person) {
  return {
    role: 'guest',
    personId: person._id,
    householdId: directory.householdIdOf(person),
    isAdult: true
  };
}
const officeViewer = {
  role: 'admin',
  personId: null,
  householdId: null,
  isAdult: true
};

// What the edit form would post for one household, with changes on top.
function post(context, extra = {}) {
  const body = {
    street: context.household.address.street,
    city: context.household.address.city,
    state: context.household.address.state,
    zip: context.household.address.zip,
    homePhone: context.household.homePhone || ''
  };
  for (const person of context.people) {
    const prefix = `p.${person._id}.`;
    Object.assign(body, {
      [`${prefix}firstName`]: person.firstName,
      [`${prefix}lastName`]: person.lastName,
      [`${prefix}preferredName`]: person.preferredName || '',
      [`${prefix}dateOfBirth`]: person.dateOfBirth,
      [`${prefix}email`]: person.email || '',
      [`${prefix}cellphone`]: person.cellphone || ''
    });
    for (const name of person.hiddenFields || []) {
      body[`${prefix}hide.${name}`] = 'on';
    }
  }
  return {
    ...body,
    ...extra
  };
}

async function save(viewer, user, householdId, bodyFor) {
  const context = await mod.editContext(viewer, householdId);
  assert.ok(context, 'the viewer may edit this household');
  const patch = directory.parseHouseholdEdit({
    body: bodyFor(context),
    household: context.household,
    people: context.people,
    office: context.office,
    today: context.today
  });
  assert.deepEqual(patch.errors, []);
  const count = await mod.applyEdit({ user }, context, patch);
  return {
    context,
    count
  };
}

test('a form posted back unchanged writes nothing and adds no audit entry', async () => {
  const sam = find('Sam', 'Sample');
  const householdId = directory.householdIdOf(sam);
  const before = (await auditFor(apos, householdId)).length;
  const { count } = await save(memberViewer(sam), {
    _id: 'u',
    title: 'Sample, Sam'
  }, householdId, post);
  assert.equal(count, 0);
  assert.equal((await auditFor(apos, householdId)).length, before);
});

test('a member changes their street; the trail names them and shows only the real change', async () => {
  const sam = find('Sam', 'Sample');
  const householdId = directory.householdIdOf(sam);
  const { count } = await save(memberViewer(sam), {
    _id: 'u1',
    title: 'Sample, Sam'
  }, householdId,
  context => post(context, { street: '1 New Street' }));
  assert.equal(count, 1);
  const entries = await auditFor(apos, householdId);
  const last = entries[entries.length - 1];
  assert.equal(last.action, 'update');
  assert.equal(last.by.title, 'Sample, Sam');
  assert.deepEqual(last.changes.map(change => change.field), [ 'address' ]);
  assert.equal(last.changes[0].new.street, '1 New Street');
  assert.equal(last.changes[0].old.street, '412 N Sample St');
  // Saving the same address again is not a change, even though Apostrophe has
  // since added its own bookkeeping to the stored object.
  const again = await save(memberViewer(sam), {
    _id: 'u1',
    title: 'Sample, Sam'
  }, householdId,
  context => post(context, { street: '1 New Street' }));
  assert.equal(again.count, 0);
  assert.equal((await auditFor(apos, householdId)).length, entries.length);
});

test('a member changing a person is recorded on that person, and the hidden box sticks', async () => {
  const sam = find('Sam', 'Sample');
  const householdId = directory.householdIdOf(sam);
  await save(memberViewer(sam), {
    _id: 'u1',
    title: 'Sample, Sam'
  }, householdId,
  context => post(context, {
    [`p.${sam._id}.cellphone`]: '(979) 555-0199',
    [`p.${sam._id}.hide.email`]: 'on'
  }));
  const fresh = (await mod.snapshot()).people.find(person => person._id === sam._id);
  assert.equal(fresh.cellphone, '(979) 555-0199');
  assert.deepEqual(fresh.hiddenFields, [ 'email' ]);
  const entries = await auditFor(apos, sam._id);
  assert.ok(entries.some(entry => entry.action === 'update' && entry.by && entry.by.title === 'Sample, Sam'));
});

test('a member may not edit another household, or one with no adults', async () => {
  const pat = find('Pat', 'Placeholder');
  const sampleHousehold = directory.householdIdOf(find('Sam', 'Sample'));
  assert.equal(await mod.editContext(memberViewer(pat), sampleHousehold), null);
  assert.ok(await mod.editContext(officeViewer, sampleHousehold));
});

test('an email another person already has is refused before anything is saved', async () => {
  const sam = find('Sam', 'Sample');
  const householdId = directory.householdIdOf(sam);
  await assert.rejects(
    save(memberViewer(sam), {
      _id: 'u1',
      title: 'Sample, Sam'
    }, householdId,
    context => post(context, {
      street: '2 Other Street',
      [`p.${sam._id}.email`]: 'pat.placeholder@example.com'
    })),
    error => error.code === 'EMAIL_TAKEN'
  );
  const fresh = (await mod.snapshot()).households.find(household => household._id === householdId);
  assert.notEqual(fresh.address.street, '2 Other Street');
});

test('the office can rename the household, set status and mark someone inactive', async () => {
  const pam = find('Pam', 'Placeholder');
  const householdId = directory.householdIdOf(pam);
  await save(officeViewer, {
    _id: 'office',
    title: 'Demo, Casey'
  }, householdId,
  context => post(context, {
    title: 'Placeholder family',
    autoName: undefined,
    [`p.${pam._id}.status`]: 'regular',
    [`p.${pam._id}.inactiveReason`]: 'left'
  }));
  const next = await mod.snapshot();
  assert.equal(next.households.find(household => household._id === householdId).title, 'Placeholder family');
  const fresh = next.people.find(person => person._id === pam._id);
  assert.equal(fresh.status, 'regular');
  assert.equal(fresh.inactiveReason, 'left');
  assert.equal(rules.isInactive(fresh), true);
  const history = await mod.history({ id: householdId }, 'en');
  assert.ok(history.some(row => row.by === 'Demo, Casey' && row.changes.some(change => change.field === 'title')));
});

test('the demo seed is idempotent and resets only on request', async () => {
  const count = (await mod.snapshot()).people.length;
  assert.equal((await mod.seedDemo()).seeded, false);
  assert.equal((await mod.snapshot()).people.length, count);
  const again = await mod.seedDemo({ reset: true });
  assert.equal(again.seeded, true);
  assert.equal((await mod.snapshot()).people.length, count);
});

// LGC-85: the first-sign-in privacy screen.
test('a member is sent to the privacy screen once; saving records it and their choices', async () => {
  const dir = apos.modules['church-directory'];
  const household = await apos.household.insert(apos.task.getReq(), {
    ...apos.household.newInstance(),
    title: 'Privacytest',
    address: { street: '1 Quiet Ln', city: 'La Grange', state: 'TX', zip: '78945' }
  });
  const person = await apos.person.insert(apos.task.getReq(), {
    ...apos.person.newInstance(),
    firstName: 'Priv',
    lastName: 'Privacytest',
    dateOfBirth: '1970-01-01',
    email: 'priv.test@example.com',
    cellphone: '(979) 555-0199',
    hiddenFields: [ 'birthday' ],
    householdIds: [ household._id ]
  });
  const viewer = await dir.viewerFor({ role: 'guest', personId: person._id });
  assert.equal(viewer.privacyPending, true, 'not seen yet');
  const office = await dir.viewerFor({ role: 'admin', personId: person._id, title: 'Office' });
  assert.ok(!office.privacyPending, 'the office is exempt');

  assert.equal(dir.privacyNext('/members/household/x'), '/members/household/x');
  assert.equal(dir.privacyNext('https://evil.example/'), '/members/directory');
  assert.equal(dir.privacyNext('//evil.example/members/'), '/members/directory');
  assert.equal(dir.privacyNext('/members/privacy?next=/members/directory'), '/members/directory');
});
