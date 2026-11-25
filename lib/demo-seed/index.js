// The full demo seed (LGC-40): about 45 households and 150 people, serving
// and fellowship groups, three months of rosters, a year of events and the
// weekly tasks list. It builds on the small hand-made set in lib/demo-data.js
// (the people the tests sign in as), and gives every record a fixed id, so a
// reset puts back the same people and a tester's sign-in still finds them.
//
// Same content every run (seeded generator, fixed lists). Dates move with
// the day it runs, so a child stays a child and "next month" stays next month.
//
// Every address is example.com. `assertSafe` refuses to write anything else.
const { createRng, SEED } = require('./rng.js');
const people = require('./people.js');
const rules = require('../rules.js');
const rosterLogic = require('@church-system/roster-logic');
const tasksLogic = require('@church-system/tasks-logic');
const { addDays, weekdayOf } = require('@church-system/calendar-logic/src/dates.js');

// Who is who in the hand-made set, for the class lists.
const BASE_GENDERS = {
  sam: 'm',
  sally: 'f',
  sasha: 'f',
  sol: 'm',
  eli: 'm',
  ella: 'f',
  casey: 'm',
  dana: 'f',
  pat: 'm',
  pam: 'f',
  riley: 'm',
  parker: 'f',
  fran: 'f',
  quinn: 'm',
  morgan: 'f',
  avery: 'm'
};

const personId = key => `demo-p-${key}`;
const householdId = key => `demo-h-${key}`;

function ageOn(person, today) {
  return Number(today.slice(0, 4)) - Number(person.dateOfBirth.slice(0, 4));
}

// The base plan plus the generated households, with the groups.
function fullPlan(today = rules.todayIso()) {
  const demo = require('../demo-data.js');
  const base = demo.plan(today);
  const generated = people.build(today);
  const households = [ ...base.households, ...generated.households ];
  const genders = {
    ...BASE_GENDERS,
    ...generated.genders
  };
  const everyone = households.flatMap(home => home.people);
  const adults = everyone.filter(person => !rules.isMinor(person.dateOfBirth, today) && !rules.isInactive(person) &&
    person.status !== 'visitor');
  const men = adults.filter(person => genders[person.key] === 'm');
  const women = adults.filter(person => genders[person.key] === 'f');
  const rng = createRng(SEED + 1);
  const pool = (list, size) => rng.shuffle(list).slice(0, size).map(person => person.key);
  const keys = list => list.map(person => person.key);
  const inAge = (min, max) => keys(everyone.filter(person => !rules.isInactive(person) &&
    ageOn(person, today) >= min && ageOn(person, today) <= max));

  const groups = [
    // Serving groups: the titles are the serving roles' (serving-role module).
    {
      title: 'Lord\'s Supper',
      groupType: 'serving',
      members: pool(men, 10)
    },
    {
      title: 'Communion Trays',
      groupType: 'serving',
      members: pool(men, 4)
    },
    {
      title: 'Announcements',
      groupType: 'serving',
      members: pool(men, 6)
    },
    {
      title: 'Opening Prayer',
      groupType: 'serving',
      members: pool(men, 8)
    },
    // Three people on purpose: the roster shows its "pool too small" warning.
    {
      title: 'Song Leader',
      groupType: 'serving',
      members: pool(men, 3)
    },
    {
      title: 'Closing Prayer',
      groupType: 'serving',
      members: pool(men, 8)
    },
    {
      title: 'Greeters',
      groupType: 'serving',
      members: pool([ ...men, ...women ], 8)
    },
    {
      title: 'Men\'s class',
      groupType: 'fellowship',
      members: keys(men)
    },
    {
      title: 'Ladies\' class',
      groupType: 'fellowship',
      members: keys(women)
    },
    {
      title: 'Young families class',
      groupType: 'fellowship',
      members: keys(adults.filter(person => ageOn(person, today) >= 28 && ageOn(person, today) <= 45))
    },
    {
      title: 'Teen class',
      groupType: 'fellowship',
      members: inAge(13, 17)
    },
    {
      title: 'Seniors\' lunch',
      groupType: 'fellowship',
      members: inAge(65, 120)
    }
  ];
  return {
    households,
    relationships: [ ...base.relationships, ...generated.relationships ],
    groups,
    genders
  };
}

// Throws unless every address in the plan is example.com.
function assertSafe(plan) {
  for (const home of plan.households) {
    for (const person of home.people) {
      if (person.email && !/@example\.com$/.test(person.email)) {
        throw new Error(`The demo seed only uses example.com addresses; ${person.key} has ${person.email}.`);
      }
    }
  }
}

function monthOf(date) {
  return date.slice(0, 7);
}

function monthsBack(today, count) {
  const out = [];
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  for (let i = 0; i <= count; i++) {
    out.unshift(`${year}-${String(month).padStart(2, '0')}`);
    month--;
    if (month < 1) {
      month = 12;
      year--;
    }
  }
  return out;
}

// Three months of past rosters and the current month, all published. Uneven
// on purpose: one song leader takes three Sundays in five, and some Sundays
// have the same person in two jobs. The month after is left empty, so the
// office can ask for a suggestion.
async function seedRosters(apos, req, ids, plan, today) {
  const rng = createRng(SEED + 2);
  const pools = Object.fromEntries(plan.groups.filter(group => group.groupType === 'serving')
    .map(group => [ group.title, group.members.map(key => ids.get(key)) ]));
  const defaults = apos.servingRole.defaults();
  const leaders = pools['Song Leader'];
  const pattern = [ 0, 0, 1, 0, 2 ];
  let sundayCount = 0;
  const months = monthsBack(today, 3);
  for (const month of months) {
    const sundays = rosterLogic.sundaysOf(month);
    const assignments = [];
    const openingBySunday = new Map();
    for (const role of defaults) {
      const group = pools[role.title];
      const dates = role.period === 'monthly' ? [ null ] : sundays;
      for (const date of dates) {
        const chosen = [];
        for (let slot = 1; slot <= role.slots; slot++) {
          let person;
          if (role.roleKey === 'songLeader') {
            person = leaders[pattern[(sundayCount + sundays.indexOf(date)) % pattern.length]];
          } else if (role.roleKey === 'closingPrayer' && openingBySunday.has(date) &&
            group.includes(openingBySunday.get(date)) && rng.next() < 0.25) {
            // The same person opens and closes.
            person = openingBySunday.get(date);
          } else {
            const free = group.filter(id => !chosen.includes(id));
            person = rng.pick(free);
          }
          chosen.push(person);
          if (role.roleKey === 'openingPrayer') {
            openingBySunday.set(date, person);
          }
          assignments.push({
            role: role.roleKey,
            date,
            slot,
            person
          });
        }
      }
    }
    sundayCount += sundays.length;
    await apos.roster.insert(req, {
      ...apos.roster.newInstance(),
      title: `Roster ${month}`,
      month,
      status: 'published',
      publishedAt: new Date(`${month}-01T12:00:00Z`).toISOString(),
      assignments
    });
  }
  return months.length;
}

// The weekly tasks list: the last four weeks, some items done, the others
// carried forward as "from last week".
async function seedTasks(apos, ids, today) {
  const versions = await apos.tasks.templateVersions();
  const office = ids.get('casey');
  const at = new Date(`${today}T17:00:00Z`);
  const current = tasksLogic.weekOf(at).weekStart;
  const weeks = [ -21, -14, -7, 0 ].map(offset => addDays(current, offset));
  // What the office ticks in each week, by item key.
  const ticked = [
    [ 'build-bulletin', 'check-events' ],
    [ 'build-bulletin', 'check-events', 'print-bulletin' ],
    [ 'build-bulletin', 'print-bulletin' ],
    [ 'check-events' ]
  ];
  let previous = [];
  for (const [ index, weekStart ] of weeks.entries()) {
    let items = tasksLogic.buildWeek({
      weekStart,
      templateVersions: versions,
      previousItems: previous,
      oneOffs: index === 3
        ? [ {
          title: 'Order new visitor cards',
          day: 'thursday',
          owner: office
        } ]
        : []
    }).map(item => (item.id.endsWith(':template:build-bulletin')
      ? {
        ...item,
        owner: office
      }
      : item));
    for (const key of ticked[index]) {
      items = tasksLogic.tickItem(items, `${weekStart}:template:${key}`, {
        by: 'Casey Demo',
        at: new Date(`${addDays(weekStart, 3)}T17:00:00Z`)
      });
    }
    // The first week is carried into the next, so tick the carried copy too
    // in the third week.
    if (index === 2) {
      for (const item of items.filter(entry => entry.fromLastWeek && !entry.done)) {
        items = tasksLogic.tickItem(items, item.id, {
          by: 'Casey Demo',
          at: new Date(`${addDays(weekStart, 2)}T17:00:00Z`)
        });
      }
    }
    await apos.tasks.weeks.insertOne({
      _id: weekStart,
      weekStart,
      items,
      rev: 0,
      builtAt: new Date(`${weekStart}T12:00:00Z`)
    });
    previous = items;
  }
  return weeks.length;
}

// The events: regular services from 12 weeks back to two months ahead (one
// Wednesday cancelled, one moved), about a year of one-offs behind us and a
// few ahead, one for members only.
function eventsPlan(today) {
  const sunday = addDays(today, (7 - weekdayOf(today)) % 7);
  const base = {
    startTime: '10:00:00',
    endTime: '11:00:00',
    dateType: 'single'
  };
  const weekly = {
    dateType: 'repeat',
    repeatPattern: 'weekly',
    repeatEnds: 'until',
    repeatUntil: addDays(today, 61)
  };
  const at = offset => addDays(sunday, offset);
  const past = [
    [ -350, 'New Year fellowship lunch', 'Fellowship hall' ],
    [ -322, 'Gospel meeting', 'Auditorium', 2 ],
    [ -294, 'Ladies\' day', 'Fellowship hall' ],
    [ -266, 'Singing night', 'Auditorium' ],
    [ -238, 'Baptism celebration', 'Fellowship hall' ],
    [ -210, 'Work day', 'Church grounds' ],
    [ -182, 'Vacation Bible School', 'Classrooms', 3 ],
    [ -154, 'Fourth of July picnic', 'City park' ],
    [ -126, 'Singing night', 'Auditorium' ],
    [ -98, 'Back-to-school blessing', 'Auditorium' ],
    [ -70, 'Fellowship meal', 'Fellowship hall' ],
    [ -42, 'Men\'s breakfast', 'Fellowship hall' ],
    [ -28, 'Fellowship meal', 'Fellowship hall' ],
    [ -14, 'Youth night', 'Fellowship hall' ]
  ].map(([ offset, title, place, extraDays ]) => ({
    ...base,
    title,
    place,
    startDate: at(offset),
    ...(extraDays
      ? {
        dateType: 'consecutive',
        endDate: addDays(at(offset), extraDays),
        allDay: true
      }
      : {})
  }));
  return [
    {
      ...base,
      ...weekly,
      title: 'Sunday worship',
      startDate: at(-84),
      regularService: true
    },
    {
      ...base,
      ...weekly,
      title: 'Wednesday Bible class',
      startDate: at(-81),
      startTime: '19:00:00',
      endTime: '20:00:00',
      regularService: true
    },
    ...past,
    {
      ...base,
      title: 'Fellowship meal',
      startDate: at(13),
      place: 'Fellowship hall'
    },
    {
      ...base,
      title: 'Elders\' meeting',
      startDate: at(9),
      startTime: '18:30:00',
      endTime: '19:30:00',
      publicEvent: false
    },
    {
      ...base,
      title: 'Singing night',
      startDate: at(16),
      place: 'Auditorium'
    },
    {
      ...base,
      title: 'Christmas Eve candlelight service',
      startDate: at(30),
      startTime: '18:00:00',
      endTime: '19:00:00'
    },
    {
      ...base,
      title: 'Gospel meeting',
      dateType: 'consecutive',
      startDate: at(20),
      endDate: at(22),
      allDay: true
    },
    {
      ...base,
      title: 'Church photo day',
      startDate: at(37),
      place: 'Auditorium'
    }
  ];
}

// The Wednesday series: one occurrence cancelled and one moved a day.
async function adjustSeries(apos, req, today) {
  const wednesday = await apos.doc.db.findOne({
    type: '@apostrophecms/event',
    aposMode: 'draft',
    title: 'Wednesday Bible class',
    isClone: { $ne: true }
  });
  const series = (await apos.event.seriesOf(req, wednesday.eventGroupId))
    .filter(occurrence => occurrence.startDate > today);
  await apos.event.editSeries(req, series[2]._id, 'this', { status: 'cancelled' }, { publish: true });
  await apos.event.editSeries(req, series[5]._id, 'this', {
    startDate: addDays(series[5].startDate, 1),
    place: 'Fellowship hall'
  }, { publish: true });
}

const STANDING = {
  leadership: 'Elders: Alden Marlowe, Wade Hargrove\nDeacons: Barrett Fenwick, Neil Alderton',
  servantLeaders: 'Minister: Hollis Kingsley\nYouth minister: Reid Lockhart',
  missions: 'We support a small congregation in the demo county, and a school in the demo city.',
  benevolence: 'Ask any elder about help with groceries or a bill. Everything is private.'
};

// Everything after the people, groups and relationships. Called by
// demo-data.js with the map of plan key to person.
async function seedExtras(apos, req, {
  plan, today, people: made, seedEvents
}) {
  assertSafe(plan);
  const ids = new Map([ ...made ].map(([ key, doc ]) => [ key, doc._id ]));
  await apos.servingRole.ensureDefaults(req);
  const events = await seedEvents(apos, today, eventsPlan(today));
  await adjustSeries(apos, apos.task.getReq({ mode: 'draft' }), today);
  const rosters = await seedRosters(apos, req, ids, plan, today);
  const weeks = await seedTasks(apos, ids, today);
  await apos.bulletinStanding.insert(req, {
    ...apos.bulletinStanding.newInstance(),
    title: 'Bulletin standing content',
    ...STANDING
  });
  // Two people away, so the roster and the bulletin have something to skip.
  const away = [ [ 'eli', 12, 18 ], [ 'pat', 24, 26 ] ];
  for (const [ key, from, to ] of away) {
    await apos.awayDate.insert(req, {
      ...apos.awayDate.newInstance(),
      title: `${addDays(today, from)} to ${addDays(today, to)}`,
      personIds: [ ids.get(key) ],
      startDate: addDays(today, from),
      endDate: addDays(today, to)
    });
  }
  return {
    events,
    rosters,
    weeks
  };
}

module.exports = {
  assertSafe,
  eventsPlan,
  fullPlan,
  householdId,
  monthOf,
  personId,
  seedExtras
};
