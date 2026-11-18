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
const people = {};

// Made-up people at example.com. December 2026 Sundays: 6, 13, 20, 27.
async function person(name, extra = {}) {
  const household = await makeHousehold(apos, req);
  people[name] = await makePerson(apos, req, household, {
    firstName: name,
    lastName: 'Roster',
    email: `${name.toLowerCase()}@example.com`,
    ...extra
  });
  return people[name];
}

async function groupOf(title, members) {
  const group = await apos.doc.db.findOne({
    type: 'group',
    title
  });
  group.membersIds = members.map(item => item._id);
  await apos.doc.db.updateOne({ _id: group._id }, { $set: { membersIds: group.membersIds } });
}

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
  await apos.servingRole.ensureDefaults(req);
  for (const name of [ 'Alder', 'Birch', 'Cedar', 'Dogwood', 'Elm', 'Fir' ]) {
    await person(name);
  }
  // Someone who left, and a child: neither may be mailed or suggested.
  await person('Gone', { inactiveReason: 'left' });
  await person('Kid', { dateOfBirth: '2018-01-01' });
  const adults = [ 'Alder', 'Birch', 'Cedar', 'Dogwood', 'Elm', 'Fir' ].map(name => people[name]);
  await groupOf('Song Leader', [ people.Alder, people.Birch, people.Gone ]);
  await groupOf('Greeters', adults);
  await groupOf('Announcements', [ people.Cedar ]);
  await groupOf('Opening Prayer', [ people.Dogwood ]);
  await groupOf('Closing Prayer', [ people.Elm ]);
  await groupOf('Lord\'s Supper', adults.slice(0, 4));
  await groupOf('Communion Trays', [ people.Fir ]);
});
test.after(async () => {
  await destroy(apos);
});

const slot = (role, date, number) => `s_${role}_${date || 'month'}_${number}`;

test('the starting roles exist once, with a serving group each', async () => {
  assert.deepEqual(await apos.servingRole.ensureDefaults(req), []);
  const { roles } = await apos.roster.rolesAndNames();
  assert.deepEqual(roles.map(role => role.id), [
    'communion', 'trays', 'announcements', 'openingPrayer', 'songLeader', 'closingPrayer', 'greeters'
  ]);
  const song = roles.find(role => role.id === 'songLeader');
  // The inactive member is left out of the pool, the others come in surname/first-name order.
  assert.deepEqual(song.eligible, [ people.Alder._id, people.Birch._id ]);
  assert.equal(roles.find(role => role.id === 'greeters').slots, 2);
  assert.equal(roles.find(role => role.id === 'communion').period, 'monthly');
});

test('a role key is a plain word, and unique', async () => {
  await assert.rejects(apos.servingRole.insert(req, {
    ...apos.servingRole.newInstance(),
    title: 'Bad',
    roleKey: 'Bad Key',
    slots: 1,
    period: 'weekly'
  }), /short name/);
  await assert.rejects(apos.servingRole.insert(req, {
    ...apos.servingRole.newInstance(),
    title: 'Again',
    roleKey: 'songLeader',
    slots: 1,
    period: 'weekly'
  }), /already has/);
});

test('the suggestion fills the month, skips someone away, and warns', async () => {
  // Alder is away on the first two Sundays; Birch is the only other song leader.
  await apos.awayDate.insert(req, {
    ...apos.awayDate.newInstance(),
    personIds: [ people.Alder._id ],
    startDate: '2026-12-01',
    endDate: '2026-12-14'
  });
  const state = await apos.roster.view(req, '2026-12');
  assert.ok(!state.doc, 'nothing is saved yet');
  const song = state.assignments.filter(entry => entry.role === 'songLeader');
  assert.equal(song.length, 4);
  assert.equal(song[0].person, people.Birch._id);
  assert.equal(song[1].person, people.Birch._id);
  assert.ok(state.warnings.every(warning => warning.type !== 'away'));
});

test('a roster is saved as a draft, adjusted, published and emailed once', async () => {
  const month = '2026-12';
  const { roles } = await apos.roster.rolesAndNames();
  const body = {};
  const suggested = (await apos.roster.view(req, month)).assignments;
  for (const entry of suggested) {
    body[slot(entry.role, entry.date, entry.slot)] = entry.person || '';
  }
  // A person outside the role's group is refused.
  assert.throws(() => apos.roster.parseForm({
    ...body,
    [slot('songLeader', '2026-12-06', 1)]: people.Cedar._id
  }, month, roles), /not in the Song Leader group/);

  const assignments = apos.roster.parseForm(body, month, roles);
  await apos.roster.save(req, month, assignments);
  let doc = await apos.roster.findMonth(req, month);
  assert.equal(doc.status, 'draft');
  assert.equal(doc.assignments.length, assignments.length);
  assert.equal(sender.outbox().length, 0, 'saving a draft sends nothing');

  const result = await apos.roster.publish(req, month, assignments);
  doc = await apos.roster.findMonth(req, month);
  assert.equal(doc.status, 'published');
  assert.ok(doc.publishedAt);
  // Six adults have an address; the child and the person who left do not get one.
  assert.equal(result.sent, 6);
  assert.equal(result.refused, 0);
  const to = sender.outbox().map(message => message.to).sort();
  assert.deepEqual(to, [ 'alder', 'birch', 'cedar', 'dogwood', 'elm', 'fir' ].map(name => `${name}@example.com`));
  const mail = sender.outbox().find(message => message.to === 'fir@example.com');
  assert.match(mail.subject, /servers for 2026-12/);
  assert.match(mail.text, /You are down for:\nCommunion Trays: All month/);
  assert.match(mail.text, /2026-12-06\nAnnouncements: Cedar Roster/);

  await assert.rejects(apos.roster.publish(req, month, assignments), /already published/);
  await assert.rejects(apos.roster.save(req, month, assignments), /published/);
});

test('a swap emails only the two people it touches', async () => {
  const month = '2026-12';
  const { roles } = await apos.roster.rolesAndNames();
  const doc = await apos.roster.findMonth(req, month);
  const body = {};
  for (const entry of doc.assignments) {
    body[slot(entry.role, entry.date, entry.slot)] = entry.person || '';
  }
  // Song leader on the 20th: whoever has it gives it to the other leader.
  const key = slot('songLeader', '2026-12-20', 1);
  const holder = body[key];
  const other = holder === people.Alder._id ? people.Birch : people.Alder;
  body[key] = other._id;
  const before = sender.outbox().length;
  const result = await apos.roster.swap(req, month, apos.roster.parseForm(body, month, roles));
  assert.equal(result.changes.length, 1);
  assert.equal(result.sent, 2);
  const sent = sender.outbox().slice(before);
  assert.deepEqual(sent.map(message => message.to).sort(),
    [ people.Alder.email, people.Birch.email ].sort());
  const gaining = sent.find(message => message.to === other.email);
  assert.match(gaining.subject, /you are serving Song Leader, 2026-12-20/);
  const losing = sent.find(message => message.to !== other.email);
  assert.match(losing.text, /no longer down for Song Leader/);

  // Nothing changed: nothing sent.
  const again = await apos.roster.swap(req, month, apos.roster.parseForm(body, month, roles));
  assert.equal(again.sent, 0);
  assert.equal(sender.outbox().length, before + 2);
  // An unpublished month can't be swapped.
  await assert.rejects(apos.roster.swap(req, '2027-01', []), /published/);
});

test('the bulletin reads the published roster, with monthly roles on every Sunday', async () => {
  const data = await apos.roster.bulletinData(req, '2026-12-13');
  assert.ok(data);
  const trays = data.assignments.filter(entry => entry.role === 'trays');
  assert.deepEqual(trays.map(entry => entry.date), [ '2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27' ]);
  assert.ok(trays.every(entry => entry.slot === 0 && entry.person === people.Fir._id));
  assert.equal(data.names[people.Fir._id], 'Fir Roster');
  assert.equal(await apos.roster.bulletinData(req, '2027-03-07'), null);
  const model = await apos.bulletin.model(req, '2026-12-13', null);
  assert.ok(JSON.stringify(model).includes('Fir Roster'));
});

test('the weekly list gets "next month\'s roster" two weeks out, until it is published', async () => {
  assert.deepEqual(await apos.roster.taskConditions('2026-11-10'), []);
  assert.deepEqual(await apos.roster.taskConditions('2026-11-20'), [], 'December is published');
  const january = await apos.roster.taskConditions('2026-12-20');
  assert.equal(january.length, 1);
  assert.equal(january[0].sourceKey, 'roster:2027-01');
});

test('history: a published month steers the next suggestion', async () => {
  const history = await apos.roster.history('2027-01');
  assert.ok(history.length > 0);
  const trays = history.find(entry => entry.role === 'trays');
  assert.equal(trays.date, '2026-12-27');
});

test('roster changes are in the audit trail', async () => {
  const entries = await apos.churchAudit.collection.find({ recordType: 'roster' }).toArray();
  assert.ok(entries.length >= 3);
});
