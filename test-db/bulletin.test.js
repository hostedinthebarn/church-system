// The bulletin piece, the standing content, the status rule and the
// directory privacy rules, against a real database (LGC-61).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  start, destroy, makeHousehold, makePerson, auditFor
} = require('./helpers.js');

let apos;
let req;
const DATE = '2026-11-15';
const FULL = [ {
  panel: 'left',
  lines: 3
} ];
const FITS = [ {
  panel: 'left',
  lines: 0
} ];

test.before(async () => {
  apos = await start();
  req = apos.task.getReq();
});
test.after(async () => {
  await destroy(apos);
});

test('one bulletin a week, a title from the date, and a Sunday is required', async () => {
  const doc = await apos.bulletin.save(req, DATE, { hand: { announcements: 'Hello' } });
  assert.equal(doc.title, `Bulletin ${DATE}`);
  assert.equal(doc.status, 'draft');
  assert.equal(doc.announcements, 'Hello');
  await assert.rejects(() => apos.bulletin.insert(req, {
    ...apos.bulletin.newInstance(),
    title: 'Again',
    weekOf: DATE
  }), /already a bulletin/);
  await assert.rejects(() => apos.bulletin.insert(req, {
    ...apos.bulletin.newInstance(),
    title: 'Blank',
    weekOf: ''
  }));
});

test('saving keeps the typed text and the office ticks; a members-only event stays out until ticked', async () => {
  await apos.bulletin.save(req, DATE, {
    hand: {
      announcements: 'Hello',
      figuresDate: 'not a date'
    },
    eventChoices: { 'demo-elders-meeting': { membersOk: false } }
  });
  let doc = await apos.bulletin.findWeek(req, DATE);
  assert.equal(doc.figuresDate, '');
  let model = await apos.bulletin.model(req, DATE, doc);
  const events = () => model.sections.find(s => s.id === 'calendar').blocks[0].items.map(i => i.id);
  assert.ok(!events().includes('demo-elders-meeting'));
  assert.ok(events().includes('demo-fellowship-meal'));
  assert.ok(events().includes('demo-work-day'));
  await apos.bulletin.save(req, DATE, { eventChoices: { 'demo-elders-meeting': { membersOk: true } } });
  doc = await apos.bulletin.findWeek(req, DATE);
  model = await apos.bulletin.model(req, DATE, doc);
  assert.ok(events().includes('demo-elders-meeting'));
  // Not on the website, even when ticked.
  const web = require('@church-system/bulletin-logic').viewFor(model, 'website');
  const webEvents = web.sections.find(s => s.id === 'calendar').blocks[0].items.map(i => i.id);
  assert.ok(!webEvents.includes('demo-elders-meeting'));
});

test('sign-off needs a measurement, refuses a full panel, and the override is recorded', async () => {
  await assert.rejects(() => apos.bulletin.setStatus(req, DATE, { status: 'signedOff' }), /not measured/);
  await assert.rejects(() => apos.bulletin.setStatus(req, DATE, {
    status: 'signedOff',
    overflow: FULL
  }), /Full: left by 3 line/);
  const bad = await apos.bulletin.findWeek(req, DATE);
  assert.equal(bad.status, 'draft');
  await assert.rejects(() => apos.bulletin.setStatus(req, DATE, { status: 'bogus' }), /Unknown status/);
  const signed = await apos.bulletin.setStatus(req, DATE, {
    status: 'signedOff',
    overflow: FULL,
    override: true
  });
  assert.equal(signed.status, 'signedOff');
  assert.equal(signed.overflowOverride, true);
  const clean = await apos.bulletin.setStatus(req, DATE, {
    status: 'signedOff',
    overflow: FITS
  });
  assert.equal(clean.overflowOverride, false);
  const printed = await apos.bulletin.setStatus(req, DATE, { status: 'printed' });
  assert.equal(printed.status, 'printed');
  // Editing a signed-off bulletin puts it back to draft.
  const edited = await apos.bulletin.save(req, DATE, { hand: { announcements: 'Changed' } });
  assert.equal(edited.status, 'draft');
  await assert.rejects(() => apos.bulletin.setStatus(req, '2030-01-06', { status: 'printed' }), /Save the bulletin first/);
});

test('status changes are in the audit trail', async () => {
  const doc = await apos.bulletin.findWeek(req, DATE);
  const trail = await auditFor(apos, doc._id);
  assert.ok(trail.length >= 4);
  assert.ok(trail.some(entry => entry.changes.some(change => change.field === 'status' && change.new === 'printed')));
});

test('standing content: one record, never deleted, blank falls back to the site details', async () => {
  assert.deepEqual(Object.values(await apos.bulletinStanding.current(req)).filter(Boolean), []);
  const standing = await apos.bulletinStanding.insert(req, {
    ...apos.bulletinStanding.newInstance(),
    title: 'x',
    leadership: 'Elders\n- Demo Elder'
  });
  assert.equal(standing.title, 'Bulletin standing content');
  await assert.rejects(() => apos.bulletinStanding.insert(req, {
    ...apos.bulletinStanding.newInstance(),
    title: 'y'
  }), /one set/);
  await assert.rejects(() => apos.bulletinStanding.delete(req, standing), /never deleted/);
  const model = await apos.bulletin.model(req, DATE, null);
  const get = id => model.sections.find(s => s.id === id);
  assert.equal(get('leadership').blocks[0].text, 'Elders');
  assert.match(JSON.stringify(get('contact').blocks), /\(979\) 968-5676/);
  assert.match(JSON.stringify(get('serviceTimes').blocks), /Sunday worship: 10:00 am/);
});

test('birthdays and anniversaries stay out unless the church switches them on, and then only valid adults', async () => {
  const household = await makeHousehold(apos, req);
  const adult = await makePerson(apos, req, household, {
    firstName: 'Ann', lastName: 'Adult', dateOfBirth: '1980-11-17'
  });
  await makePerson(apos, req, household, {
    firstName: 'Kid', lastName: 'Minor', dateOfBirth: '2015-11-17'
  });
  await makePerson(apos, req, household, {
    firstName: 'Hal', lastName: 'Hidden', dateOfBirth: '1970-11-18', hiddenFields: [ 'birthday' ]
  });
  await makePerson(apos, req, household, {
    firstName: 'Dan', lastName: 'Dead', dateOfBirth: '1950-11-19', inactiveReason: 'deceased'
  });
  const spouse = await makePerson(apos, req, household, {
    firstName: 'Sue', lastName: 'Adult', dateOfBirth: '1981-03-03'
  });
  await apos.personRelationship.insert(req, {
    ...apos.personRelationship.newInstance(),
    kind: 'spouse',
    personAIds: [ adult._id ],
    personBIds: [ spouse._id ],
    anniversary: '2005-11-20'
  });
  const off = await apos.bulletin.model(req, DATE, null);
  assert.equal(off.sections.find(s => s.id === 'birthdays').empty, true);

  const site = apos.modules['church-site'].options.site;
  const before = site.bulletin.switches;
  site.bulletin.switches = { birthdays: { print: true } };
  try {
    const on = await apos.bulletin.model(req, DATE, null);
    const text = JSON.stringify(on.sections.find(s => s.id === 'birthdays').blocks);
    assert.match(text, /Ann Adult/);
    assert.match(text, /Ann Adult & Sue Adult/);
    for (const leak of [ 'Kid', 'Hal', 'Dan', '2015', '1980', '2005' ]) {
      assert.ok(!text.includes(leak), `${leak} leaked`);
    }
    const web = require('@church-system/bulletin-logic').viewFor(on, 'website');
    assert.ok(!web.sections.some(s => s.id === 'birthdays'));
  } finally {
    site.bulletin.switches = before;
  }
});

test('once the church has real events, the calendar panel lists them and not the demo ones; a members-only one waits for the tick', async () => {
  const eventReq = apos.task.getReq({ mode: 'draft' });
  const add = async fields => apos.event.publish(eventReq, await apos.event.insert(eventReq, {
    ...apos.event.newInstance(),
    startTime: '18:30:00',
    endTime: '19:30:00',
    dateType: 'single',
    ...fields
  }));
  const potluck = await add({ title: 'Real potluck', startDate: '2026-11-18', place: 'Fellowship hall' });
  const elders = await add({ title: 'Real elders', startDate: '2026-11-19', publicEvent: false });
  await add({ title: 'Too far off', startDate: '2026-12-20' });
  const model = await apos.bulletin.model(req, DATE, await apos.bulletin.findWeek(req, DATE));
  const ids = () => model.sections.find(s => s.id === 'calendar').blocks[0].items.map(i => i.id);
  assert.ok(ids().includes(potluck.aposDocId));
  assert.ok(!ids().some(id => id.startsWith('demo-')), 'the demo source is not used once events exist');
  assert.ok(!ids().includes(elders.aposDocId), 'members-only stays out until the office ticks it');
  const text = JSON.stringify(model.sections.find(s => s.id === 'calendar'));
  assert.match(text, /Real potluck/);
  assert.match(text, /6:30 pm/, 'Chicago wall-clock time, whatever the server zone');
  assert.doesNotMatch(text, /Too far off/);
  await apos.bulletin.save(req, DATE, { eventChoices: { [elders.aposDocId]: { membersOk: true } } });
  const ticked = await apos.bulletin.model(req, DATE, await apos.bulletin.findWeek(req, DATE));
  assert.ok(ticked.sections.find(s => s.id === 'calendar').blocks[0].items.some(i => i.id === elders.aposDocId));
});
