// The demo members: made-up households that cover the edge cases in
// poc-data-model.md, for the demo site and for the browser tests. Every name,
// address and phone number is invented (555 numbers, example.com addresses).
// Dates of birth for the children are worked out from today so a child stays
// a child for as long as the demo is used.
const rules = require('./rules.js');
const { addDays, weekdayOf } = require('@church-system/calendar-logic/src/dates.js');

const RECORD_TYPES = [ 'household', 'person', 'person-relationship', 'group', 'office-note', 'away-date' ];

function yearsAgo(years, monthDay, today) {
  return `${Number(today.slice(0, 4)) - years}-${monthDay}`;
}

// Who signs in during the tests: sam.sample@example.com is a member of the
// Sample household, casey.office@example.com is the office admin.
function plan(today = rules.todayIso()) {
  return {
    households: [
      {
        key: 'sample',
        address: {
          street: '412 N Sample St',
          city: 'La Grange',
          state: 'TX',
          zip: '78945'
        },
        homePhone: '',
        people: [
          {
            key: 'sam',
            firstName: 'Sam',
            lastName: 'Sample',
            dateOfBirth: '1980-03-14',
            email: 'sam.sample@example.com',
            cellphone: '(979) 555-0101'
          },
          {
            key: 'sally',
            firstName: 'Sally',
            lastName: 'Sample',
            preferredName: 'Sal',
            dateOfBirth: '1982-09-02',
            cellphone: '(979) 555-0102',
            hiddenFields: [ 'cellphone' ]
          },
          {
            key: 'sasha',
            firstName: 'Sasha',
            lastName: 'Sample',
            dateOfBirth: yearsAgo(13, '06-21', today),
            cellphone: '(979) 555-0103'
          },
          {
            key: 'sol',
            firstName: 'Sol',
            lastName: 'Sample',
            dateOfBirth: yearsAgo(9, '11-30', today)
          }
        ]
      },
      {
        key: 'example',
        address: {
          street: '18 Example Ln',
          city: 'La Grange',
          state: 'TX',
          zip: '78945'
        },
        homePhone: '(979) 555-0142',
        people: [
          {
            key: 'eli',
            firstName: 'Eli',
            lastName: 'Example',
            dateOfBirth: '1951-01-09',
            email: 'eli.example@example.com',
            hiddenFields: [ 'address' ]
          },
          {
            key: 'ella',
            firstName: 'Ella',
            lastName: 'Example',
            dateOfBirth: '1953-07-23'
          }
        ]
      },
      {
        key: 'demo',
        address: {
          street: '901 Demo Rd',
          city: 'Fayetteville',
          state: 'TX',
          zip: '78940'
        },
        homePhone: '',
        people: [
          {
            key: 'casey',
            firstName: 'Casey',
            lastName: 'Demo',
            dateOfBirth: '1965-12-01',
            email: 'casey.office@example.com',
            cellphone: '(979) 555-0120',
            officeAdmin: true,
            baptismDate: '1990-05-06',
            showBaptism: true
          },
          {
            key: 'dana',
            firstName: 'Dana',
            lastName: 'Demo',
            dateOfBirth: '1963-04-18',
            inactiveReason: 'deceased'
          }
        ]
      },
      {
        key: 'placeholder',
        address: {
          street: '7 Placeholder Ct',
          city: 'La Grange',
          state: 'TX',
          zip: '78945'
        },
        homePhone: '(979) 555-0177',
        people: [
          {
            key: 'pat',
            firstName: 'Pat',
            lastName: 'Placeholder',
            dateOfBirth: '1958-02-11',
            email: 'pat.placeholder@example.com'
          },
          {
            key: 'pam',
            firstName: 'Pam',
            lastName: 'Placeholder',
            dateOfBirth: '1959-10-05'
          }
        ]
      },
      {
        key: 'test',
        address: {
          street: '233 Test Ave',
          city: 'Schulenburg',
          state: 'TX',
          zip: '78956'
        },
        homePhone: '',
        people: [
          {
            key: 'riley',
            firstName: 'Riley',
            lastName: 'Test',
            dateOfBirth: '1988-08-30',
            email: 'riley.test@example.com',
            cellphone: '(979) 555-0150'
          },
          {
            key: 'parker',
            firstName: 'Parker',
            lastName: 'Placeholder',
            dateOfBirth: '1985-05-17',
            cellphone: '(979) 555-0151'
          }
        ]
      },
      {
        key: 'figure',
        address: {
          street: '14 Figure St',
          city: 'La Grange',
          state: 'TX',
          zip: '78945'
        },
        homePhone: '',
        people: [ {
          key: 'fran',
          firstName: 'Fran',
          lastName: 'Figure',
          dateOfBirth: yearsAgo(16, '10-12', today),
          email: 'fran.figure@example.com'
        } ]
      },
      {
        key: 'quill',
        directoryOptOut: true,
        address: {
          street: '3100 Quill Rd',
          city: 'Round Top',
          state: 'TX',
          zip: '78954'
        },
        homePhone: '(979) 555-0110',
        people: [ {
          key: 'quinn',
          firstName: 'Quinn',
          lastName: 'Quill',
          dateOfBirth: '1971-06-06'
        } ]
      },
      {
        key: 'mock',
        address: {
          street: '55 Mockingbird Dr',
          city: 'La Grange',
          state: 'TX',
          zip: '78945'
        },
        homePhone: '',
        people: [ {
          key: 'morgan',
          firstName: 'Morgan',
          lastName: 'Mock',
          dateOfBirth: '1990-01-25',
          status: 'visitor'
        } ]
      },
      {
        key: 'away',
        address: {
          street: '9 Moved Way',
          city: 'Austin',
          state: 'TX',
          zip: '78701'
        },
        homePhone: '',
        people: [ {
          key: 'avery',
          firstName: 'Avery',
          lastName: 'Away',
          dateOfBirth: '1975-11-02',
          inactiveReason: 'moved'
        } ]
      }
    ],
    relationships: [
      {
        kind: 'spouse',
        a: 'sam',
        b: 'sally',
        anniversary: '2006-06-10'
      },
      {
        kind: 'parent-child',
        a: 'sam',
        b: 'sasha'
      },
      {
        kind: 'parent-child',
        a: 'sally',
        b: 'sasha'
      },
      {
        kind: 'parent-child',
        a: 'sam',
        b: 'sol'
      },
      {
        kind: 'parent-child',
        a: 'sally',
        b: 'sol'
      },
      {
        kind: 'spouse',
        a: 'eli',
        b: 'ella',
        anniversary: '1975-08-16'
      },
      {
        kind: 'spouse',
        a: 'casey',
        b: 'dana',
        anniversary: '1990-09-22'
      },
      {
        kind: 'spouse',
        a: 'pat',
        b: 'pam',
        anniversary: '1982-04-03'
      },
      {
        kind: 'parent-child',
        a: 'pat',
        b: 'parker'
      },
      {
        kind: 'parent-child',
        a: 'pam',
        b: 'parker'
      },
      {
        kind: 'guardian',
        a: 'riley',
        b: 'fran'
      }
    ],
    groups: [
      {
        title: 'Men\'s class',
        groupType: 'fellowship',
        members: [ 'sam', 'eli', 'pat', 'riley' ]
      },
      {
        title: 'Ladies\' class',
        groupType: 'fellowship',
        members: [ 'sally', 'ella', 'pam' ]
      },
      {
        title: 'Communion servers',
        groupType: 'serving',
        members: [ 'sam', 'pat', 'riley' ]
      }
    ]
  };
}

// The regular services and a few one-offs (one members-only, one cancelled, one over several days),
// dated from `today`. Without them the calendar feeds are empty.
function eventsPlan(today) {
  const sunday = addDays(today, (7 - weekdayOf(today)) % 7);
  const base = { startTime: '10:00:00', endTime: '11:00:00', dateType: 'single' };
  const weekly = { dateType: 'repeat', repeatPattern: 'weekly', repeatEnds: 'never' };
  return [
    { ...base, ...weekly, title: 'Sunday worship', startDate: sunday, regularService: true },
    {
      ...base,
      ...weekly,
      title: 'Wednesday Bible class',
      startDate: addDays(sunday, 3),
      startTime: '19:00:00',
      endTime: '20:00:00',
      regularService: true
    },
    { ...base, title: 'Fellowship meal', startDate: addDays(sunday, 13), place: 'Fellowship hall' },
    {
      ...base,
      title: 'Elders\' meeting',
      startDate: addDays(sunday, 9),
      startTime: '18:30:00',
      endTime: '19:30:00',
      publicEvent: false
    },
    { ...base, title: 'Singing night', startDate: addDays(sunday, 16), status: 'cancelled' },
    // Three days running, so the month calendar shows it on each of them.
    {
      ...base,
      title: 'Gospel meeting',
      dateType: 'consecutive',
      startDate: addDays(sunday, 20),
      endDate: addDays(sunday, 22),
      allDay: true
    }
  ];
}

// The Events page, so events have an address. Skipped where there is no
// event page module (some test setups).
async function seedEvents(apos, today, plan = eventsPlan(today)) {
  const eventPage = apos.modules['@apostrophecms/event-page'];
  if (!apos.event || !eventPage) {
    return 0;
  }
  const req = apos.task.getReq({ mode: 'draft' });
  const existing = await apos.doc.db.findOne({ type: '@apostrophecms/event-page', aposMode: 'draft' });
  if (!existing) {
    const page = await apos.page.insert(req, '_home', 'lastChild', {
      ...eventPage.newInstance(),
      title: 'Events',
      slug: '/events'
    });
    await apos.page.publish(req, page);
  }
  for (const entry of plan) {
    const piece = await apos.event.insert(req, {
      ...apos.event.newInstance(),
      ...entry
    });
    await apos.event.publish(req, piece);
  }
  return plan.length;
}

// Real testers' own records, ticked "Keep through a demo reset": the people,
// their households and (by personId) their sign-in users survive a reset.
// No real address is written into the code; the tick is data.
async function keptRecords(apos) {
  // Never a seeded record (fixed ids `demo-…`): the re-seed makes those
  // again with the same ids, so keeping one would stop the reset with a
  // duplicate id. A tick on a demo person is ignored.
  const people = await apos.doc.db.find({
    type: 'person',
    keepOnDemoReset: true,
    _id: { $not: /^demo-/ }
  }).project({
    _id: 1,
    householdIds: 1
  }).toArray();
  const personIds = people.map(person => person._id);
  const householdIds = [ ...new Set(people.flatMap(person => person.householdIds || [])) ]
    .filter(id => !String(id).startsWith('demo-'));
  return {
    personIds,
    householdIds,
    // The church records a wipe removes: every one of RECORD_TYPES but these.
    wipeFilter: {
      type: { $in: RECORD_TYPES },
      _id: { $nin: [ ...personIds, ...householdIds ] }
    }
  };
}

async function reset(apos) {
  const keep = await keptRecords(apos);
  await apos.doc.db.deleteMany(keep.wipeFilter);
  await apos.doc.db.deleteMany({ type: '@apostrophecms/event' });
  // Sign-in users made from people; other users (the first admin) and kept
  // testers' users stay.
  const users = await apos.doc.db.find({
    type: '@apostrophecms/user',
    personId: {
      $exists: true,
      $nin: keep.personIds
    }
  }).project({ _id: 1 }).toArray();
  const ids = users.map(user => user._id);
  // Apostrophe keeps each user's email in a second collection; left behind, it
  // would refuse the same person's next sign-in.
  await apos.doc.db.deleteMany({ _id: { $in: ids } });
  const safe = apos.db.collection('aposUsersSafe');
  const kept = new Set((await apos.doc.db.find({ type: '@apostrophecms/user' })
    .project({ _id: 1 }).toArray()).map(user => user._id));
  const orphans = (await safe.find({}).project({ _id: 1 }).toArray())
    .map(entry => entry._id)
    .filter(id => !kept.has(id));
  await safe.deleteMany({ _id: { $in: orphans } });
  for (const name of [ 'churchAudit', 'churchSigninTokens', 'churchSigninAttempts' ]) {
    await apos.db.collection(name).deleteMany({});
  }
}

// Fills an empty database. With `reset`, first removes every church record.
// With `full`, makes the whole demo (lib/demo-seed): about 45 households,
// groups, rosters, a year of events and the weekly tasks, every record with a
// fixed id. Without it, only the small set the tests sign in as.
async function seed(apos, { reset: wipe = false, today = rules.todayIso(), full = false } = {}) {
  if (wipe && full) {
    // Keeps accounts and the trail; see lib/demo-seed/reset.js.
    await require('./demo-seed/reset.js').wipe(apos);
  } else if (wipe) {
    await reset(apos);
  } else if (await apos.doc.db.findOne({ type: 'household' })) {
    return { seeded: false };
  }
  const req = apos.task.getReq();
  const demoSeed = full ? require('./demo-seed/index.js') : null;
  const data = full ? demoSeed.fullPlan(today) : plan(today);
  if (full) {
    demoSeed.assertSafe(data);
  }
  const people = new Map();
  let count = 0;
  for (const entry of data.households) {
    const household = await apos.household.insert(req, {
      ...apos.household.newInstance(),
      ...(full ? { aposDocId: demoSeed.householdId(entry.key) } : {}),
      title: `${entry.people[0].lastName}`,
      address: entry.address,
      homePhone: entry.homePhone,
      directoryOptOut: Boolean(entry.directoryOptOut)
    });
    for (const { key, ...fields } of entry.people) {
      people.set(key, await apos.person.insert(req, {
        ...apos.person.newInstance(),
        status: 'member',
        ...(full ? { aposDocId: demoSeed.personId(key) } : {}),
        ...fields,
        householdIds: [ household._id ]
      }));
      count += 1;
    }
  }
  for (const link of data.relationships) {
    await apos.personRelationship.insert(req, {
      ...apos.personRelationship.newInstance(),
      kind: link.kind,
      personAIds: [ people.get(link.a)._id ],
      personBIds: [ people.get(link.b)._id ],
      anniversary: link.anniversary || null
    });
  }
  for (const group of data.groups) {
    await apos.group.insert(req, {
      ...apos.group.newInstance(),
      title: group.title,
      groupType: group.groupType,
      membersIds: group.members.map(key => people.get(key)._id)
    });
  }
  if (full) {
    return {
      seeded: true,
      households: data.households.length,
      people: count,
      ...await demoSeed.seedExtras(apos, req, {
        plan: data,
        today,
        people,
        seedEvents
      })
    };
  }
  const events = await seedEvents(apos, today);
  return {
    seeded: true,
    events,
    households: data.households.length,
    people: count
  };
}

module.exports = {
  RECORD_TYPES,
  keptRecords,
  plan,
  reset,
  seed
};
