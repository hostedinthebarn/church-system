// The weekly tasks list against a real database (LGC-43): building the week,
// ticking, the template, carry-over, system items and the morning reminders.
// The clock is set by the test; dates come from packages/tasks-logic.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  start, destroy, makeHousehold, makePerson, auditFor
} = require('./helpers.js');
const { createFakeSender, createMailer } = require('../lib/mail.js');

const MONDAY = '2026-11-16';
const NEXT_MONDAY = '2026-11-23';
// Tuesday 09:00 in Chicago (CST, UTC-6).
const TUESDAY_MORNING = '2026-11-17T15:00:00Z';

let apos;
let sender;
let clock = new Date(TUESDAY_MORNING);
let live = [];
let brynna;
let scott;

const officeReq = name => {
  const req = apos.task.getReq();
  req.user = {
    ...req.user,
    title: name
  };
  return req;
};
const titles = items => items.map(item => item.title);

test.before(async () => {
  sender = createFakeSender();
  apos = await start({
    tasks: {
      options: {
        now: () => clock,
        mail: createMailer({
          sender,
          allowlist: [ '@example.com' ]
        })
      }
    }
  });
  const site = apos.modules['church-site'].options.site;
  apos.modules['church-site'].options.site = {
    ...site,
    tasks: {
      officeAddress: 'office@example.com',
      sources: { systemConditions: async () => live }
    }
  };
  const req = apos.task.getReq();
  const household = await makeHousehold(apos, req);
  brynna = await makePerson(apos, req, household, {
    firstName: 'Brynna',
    lastName: 'Office',
    email: 'brynna@example.com',
    officeAdmin: true
  });
  scott = await makePerson(apos, req, household, {
    firstName: 'Scott',
    lastName: 'Office',
    email: 'scott@example.com',
    officeAdmin: true
  });
});
test.after(async () => {
  await destroy(apos);
});

test('building the week twice, at once, gives one list from the template', async () => {
  const docs = await Promise.all([ 1, 2, 3 ].map(() => apos.tasks.ensureCurrentWeek()));
  assert.ok(docs.every(doc => doc.weekStart === MONDAY));
  assert.equal(await apos.tasks.weeks.countDocuments(), 1);
  const { items } = await apos.tasks.list(officeReq('Brynna'));
  assert.deepEqual(titles(items), [ 'Build the bulletin', 'Print the bulletin', 'Check the coming week\'s events' ]);
  assert.deepEqual(items.map(item => item.dueDate), [ '2026-11-20', '2026-11-21', '2026-11-18' ]);
});

test('only the office can read or change the list', async () => {
  for (const req of [ apos.task.getGuestReq(), apos.task.getAnonReq() ]) {
    await assert.rejects(() => apos.tasks.list(req), /forbidden/);
    await assert.rejects(() => apos.tasks.tick(req, MONDAY, `${MONDAY}:template:build-bulletin`), /forbidden/);
    await assert.rejects(() => apos.tasks.addOneOff(req, { title: 'x' }), /forbidden/);
  }
});

test('ticking records who and when, and the audit trail has it', async () => {
  const id = `${MONDAY}:template:build-bulletin`;
  await apos.tasks.tick(officeReq('Brynna Office'), MONDAY, id);
  const { items } = await apos.tasks.list(officeReq('Brynna'));
  const item = items.find(each => each.id === id);
  assert.equal(item.done, true);
  assert.equal(item.doneBy, 'Brynna Office');
  assert.equal(item.doneAt, TUESDAY_MORNING.replace('Z', '.000Z'));
  const trail = await auditFor(apos, MONDAY);
  const entry = trail.find(each => each.changes.some(change => change.field === `item:${id}`));
  assert.equal(entry.by.title, 'Brynna Office');
  await assert.rejects(() => apos.tasks.tick(officeReq('B'), MONDAY, 'nope'), /No such task/);
  await assert.rejects(() => apos.tasks.tick(officeReq('B'), '2026-11-09', id), /Only this week/);
});

test('one-offs and owners: validated, and the owner must be in the office', async () => {
  const item = await apos.tasks.addOneOff(officeReq('Brynna'), {
    title: '  Order name tags ',
    day: 'thursday',
    owner: scott._id
  });
  assert.equal(item.title, 'Order name tags');
  assert.equal(item.dueDate, '2026-11-19');
  assert.equal(item.owner, scott._id);
  await assert.rejects(() => apos.tasks.addOneOff(officeReq('B'), { title: '' }), /title/);
  await assert.rejects(() => apos.tasks.addOneOff(officeReq('B'), {
    title: 'x',
    day: 'someday'
  }), /day of the week/);
  await assert.rejects(() => apos.tasks.addOneOff(officeReq('B'), {
    title: 'x',
    owner: 'not-a-person'
  }), /office/);
  await apos.tasks.setOwner(officeReq('B'), MONDAY, item.id, brynna._id);
  const { items } = await apos.tasks.list(officeReq('B'));
  assert.equal(items.find(each => each.id === item.id).owner, brynna._id);
});

test('a template edit starts next week and leaves this week alone', async () => {
  await apos.tasks.saveTemplate(officeReq('Brynna'), [
    {
      key: 'build-bulletin',
      title: 'Build the bulletin',
      day: 'thursday',
      owner: brynna._id
    },
    {
      title: 'Lock up',
      day: 'sunday'
    }
  ]);
  const editing = await apos.tasks.templateForEditing();
  assert.equal(editing.startsNextWeek, true);
  assert.equal(editing.nextWeekStart, NEXT_MONDAY);
  const { items } = await apos.tasks.list(officeReq('B'));
  assert.ok(!titles(items).includes('Lock up'));
  assert.equal(items.find(each => each.id === `${MONDAY}:template:build-bulletin`).dueDate, '2026-11-20');
  assert.ok((await auditFor(apos, 'task-template')).length >= 1);
  await assert.rejects(() => apos.tasks.saveTemplate(officeReq('B'), [ { title: '' } ]), /title/);
  // Editing again replaces the waiting version rather than adding one.
  await apos.tasks.saveTemplate(officeReq('Brynna'), [
    {
      key: 'build-bulletin',
      title: 'Build the bulletin',
      day: 'thursday',
      owner: brynna._id
    },
    {
      key: 'lock-up',
      title: 'Lock up',
      day: 'sunday'
    }
  ]);
  assert.equal(await apos.tasks.templates.countDocuments(), 2);
});

test('system items: added, resolved by the system, and a manual tick stands', async () => {
  live = [
    {
      sourceKey: 'fb:1',
      title: 'Facebook post failed',
      owner: null,
      dueDate: MONDAY
    },
    {
      sourceKey: 'event:2',
      title: 'Event has no image',
      owner: null,
      dueDate: MONDAY
    }
  ];
  await apos.tasks.syncSystem();
  await apos.tasks.syncSystem();
  let { items } = await apos.tasks.list(officeReq('B'));
  assert.equal(items.filter(item => item.kind === 'system').length, 2);
  // The office accepts the event as it is; the post gets fixed.
  await apos.tasks.tick(officeReq('Brynna'), MONDAY, 'system:event:2');
  live = [ live[1] ];
  await apos.tasks.syncSystem();
  ({ items } = await apos.tasks.list(officeReq('B')));
  const fb = items.find(item => item.id === 'system:fb:1');
  assert.equal(fb.done, true);
  assert.equal(fb.resolvedBySystem, true);
  assert.equal(fb.doneBy, null);
  const event = items.find(item => item.id === 'system:event:2');
  assert.equal(event.resolvedBySystem, false);
  assert.equal(event.doneBy, 'Brynna');
});

test('the next week: template from then, unticked carried over, accepted system items stay accepted', async () => {
  clock = new Date('2026-11-23T15:00:00Z');
  await apos.tasks.syncSystem();
  const { items } = await apos.tasks.list(officeReq('B'));
  assert.ok(titles(items).includes('Lock up'));
  const carried = items.filter(item => item.fromLastWeek);
  assert.deepEqual(titles(carried).sort(), [
    'Check the coming week\'s events', 'Order name tags', 'Print the bulletin'
  ]);
  const build = items.find(item => item.id === `${NEXT_MONDAY}:template:build-bulletin`);
  assert.equal(build.dueDate, '2026-11-26');
  assert.equal(build.owner, brynna._id);
  // The still-live event problem was accepted last week: no new item for it.
  assert.ok(!items.some(item => item.kind === 'system'));
  // Last week is kept exactly as it was.
  const old = await apos.tasks.list(officeReq('B'), MONDAY);
  assert.ok(!titles(old.items).includes('Lock up'));
  assert.equal(await apos.tasks.list(officeReq('B'), '2026-01-05'), null);
  live = [];
});

test('reminders: one email per person per morning, none before 07:00, none twice', async () => {
  clock = new Date('2026-11-24T15:00:00Z');
  // Brynna's Thursday item is not due yet; add one due today for her, one
  // overdue for nobody, and one for Scott who has turned his reminders off.
  const req = officeReq('Brynna');
  await apos.tasks.addOneOff(req, {
    title: 'Mail the cards',
    day: 'tuesday',
    owner: brynna._id
  });
  await apos.tasks.addOneOff(req, {
    title: 'Ring the plumber',
    day: 'monday'
  });
  await apos.tasks.addOneOff(req, {
    title: 'Scott\'s job',
    day: 'tuesday',
    owner: scott._id
  });
  await apos.person.update(apos.task.getReq(), {
    ...await apos.person.find(apos.task.getReq(), { _id: scott._id }).toObject(),
    remindersOff: true
  });

  clock = new Date('2026-11-24T10:00:00Z');
  assert.deepEqual(await apos.tasks.runDaily(), []);
  assert.equal(sender.outbox().length, 0);

  clock = new Date('2026-11-24T13:30:00Z');
  const sent = await apos.tasks.runDaily();
  assert.deepEqual(sent.map(result => result.to).sort(), [ 'brynna@example.com', 'office@example.com' ]);
  const outbox = sender.outbox();
  assert.equal(outbox.length, 2);
  const toBrynna = outbox.find(message => message.to === 'brynna@example.com');
  assert.match(toBrynna.text, /Mail the cards/);
  assert.match(toBrynna.text, /Order name tags \(overdue, was due 2026-11-19\)/);
  assert.doesNotMatch(toBrynna.text, /Scott's job/);
  const toOffice = outbox.find(message => message.to === 'office@example.com').text;
  assert.match(toOffice, /Ring the plumber/);
  assert.match(toOffice, /Print the bulletin \(overdue, was due 2026-11-21\)/);

  // Again, and at another time the same morning: nothing more goes out.
  await apos.tasks.runDaily();
  clock = new Date('2026-11-24T18:00:00Z');
  await apos.tasks.runDaily();
  assert.equal(sender.outbox().length, 2);
  assert.equal(await apos.tasks.reminders.countDocuments({ date: '2026-11-24' }), 2);

  // The next morning they come again.
  clock = new Date('2026-11-25T13:30:00Z');
  await apos.tasks.runDaily();
  assert.equal(sender.outbox().length, 4);
});

test('a failed send is retried, and an address off the allowlist is claimed so it is not retried all day', async () => {
  clock = new Date('2026-11-26T13:30:00Z');
  const real = apos.tasks.mailer;
  let fail = true;
  apos.tasks.mailer = () => ({
    async send(message) {
      if (fail) {
        throw new Error('down');
      }
      return real().send(message);
    }
  });
  const quiet = apos.util.error;
  apos.util.error = () => {};
  try {
    assert.deepEqual(await apos.tasks.sendReminders(), []);
    assert.equal(await apos.tasks.reminders.countDocuments({ date: '2026-11-26' }), 0);
    fail = false;
    assert.ok((await apos.tasks.sendReminders()).length > 0);
  } finally {
    apos.util.error = quiet;
    apos.tasks.mailer = real;
  }
});
