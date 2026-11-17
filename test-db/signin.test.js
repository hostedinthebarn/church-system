// Needs a database: run with MongoDB at APOS_MONGODB_URI (CI does).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  start, destroy, makeHousehold, makePerson
} = require('./helpers.js');
const { createFakeSender, createMailer } = require('../lib/mail.js');

let apos;
let req;
let sender;

test.before(async () => {
  sender = createFakeSender();
  apos = await start({
    'church-signin': {
      options: {
        mail: createMailer({
          sender,
          allowlist: [ '@example.com' ]
        })
      }
    }
  });
  req = apos.task.getReq();
});
test.after(async () => {
  await destroy(apos);
});

const verifyUrl = 'https://church.test/sign-in/verify';

async function link(email) {
  const before = sender.outbox().length;
  await apos.churchSignin.signin.requestLink({
    email,
    ip: `ip-${Math.random()}`,
    verifyUrl,
    locale: 'en'
  });
  const sent = sender.outbox().slice(before);
  if (!sent.length) {
    return null;
  }
  return new URL(/https?:\/\/\S+/.exec(sent[0].text)[0]).searchParams.get('token');
}

test('an adult member signs in once with an emailed link and gets a guest user', async () => {
  const household = await makeHousehold(apos, req);
  const person = await makePerson(apos, req, household, { email: 'member@example.com' });
  const token = await link('member@example.com');
  assert.ok(token);
  const first = await apos.churchSignin.signin.redeem({
    token,
    ip: 'x'
  });
  assert.equal(first.ok, true);
  assert.equal(first.personId, person._id);
  assert.equal((await apos.churchSignin.signin.redeem({
    token,
    ip: 'x'
  })).ok, false);

  const user = await apos.churchSignin.userFor(person);
  assert.equal(user.role, 'guest');
  assert.equal(user.email, 'member@example.com');
  // The same person gets the same user next time.
  const again = await apos.churchSignin.userFor(person);
  assert.equal(again._id, user._id);
});

test('an office admin signs in as an admin, and the role follows the flag', async () => {
  const household = await makeHousehold(apos, req);
  const person = await makePerson(apos, req, household, {
    email: 'office@example.com',
    officeAdmin: true
  });
  assert.equal((await apos.churchSignin.userFor(person)).role, 'admin');
  const demoted = await apos.person.update(req, {
    ...person,
    officeAdmin: false
  });
  assert.equal((await apos.churchSignin.userFor(demoted)).role, 'guest');
});

test('a minor gets no link', async () => {
  const household = await makeHousehold(apos, req);
  await makePerson(apos, req, household, {
    email: 'kid@example.com',
    dateOfBirth: '2016-01-01'
  });
  assert.equal(await link('kid@example.com'), null);
});

test('an address off the allowlist gets no link, even for a real member', async () => {
  const household = await makeHousehold(apos, req);
  await makePerson(apos, req, household, { email: 'stranger@gmail.com' });
  assert.equal(await link('stranger@gmail.com'), null);
});

test('an expired link fails', async () => {
  const household = await makeHousehold(apos, req);
  await makePerson(apos, req, household, { email: 'late@example.com' });
  const token = await link('late@example.com');
  await apos.churchSignin.tokens.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await apos.churchSignin.signin.redeem({
    token,
    ip: 'x'
  })).ok, false);
});
