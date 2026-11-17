// Made-up events and servers for the bulletin POC, built round whichever
// Sunday is asked for. Replaced by the real event and roster pieces when they
// land; the bulletin module only calls these two functions.
const { localToInstant } = require('@church-system/calendar-logic');
const { addDaysIso } = require('@church-system/bulletin-logic');

const at = (date, time) => new Date(localToInstant(date, time)).toISOString();

function events(weekOf) {
  const base = {
    announceFrom: at(addDaysIso(weekOf, -14), '00:00'),
    isRegularService: false,
    status: 'scheduled'
  };
  return [
    {
      ...base,
      id: 'demo-fellowship-meal',
      title: 'Fellowship meal',
      startsAt: at(addDaysIso(weekOf, 7), '12:00'),
      location: 'Fellowship hall'
    },
    {
      ...base,
      id: 'demo-ladies-class',
      title: 'Ladies\' Bible class',
      startsAt: at(addDaysIso(weekOf, 3), '09:30')
    },
    {
      ...base,
      id: 'demo-elders-meeting',
      title: 'Elders and deacons meeting',
      startsAt: at(addDaysIso(weekOf, 2), '18:00'),
      visibility: 'members'
    },
    {
      ...base,
      id: 'demo-wednesday-class',
      title: 'Wednesday Bible class',
      startsAt: at(addDaysIso(weekOf, 3), '18:30'),
      isRegularService: true,
      status: 'changed'
    },
    {
      ...base,
      id: 'demo-work-day',
      title: 'Church work day',
      startsAt: at(addDaysIso(weekOf, 6), '08:00'),
      status: 'cancelled'
    }
  ];
}

function roster(weekOf) {
  const next = addDaysIso(weekOf, 7);
  const people = {
    p1: 'Pat Example',
    p2: 'Sam Sample',
    p3: 'Lee Demo',
    p4: 'Alex Placeholder',
    p5: 'Jo Fictional',
    p6: 'Kim Madeup',
    p7: 'Chris Invented',
    p8: 'Drew Pretend'
  };
  const give = (role, date, slot, person) => ({
    role,
    date,
    slot,
    person
  });
  return {
    names: people,
    assignments: [
      give('announcements', weekOf, 0, 'p1'),
      give('openingPrayer', weekOf, 0, 'p2'),
      give('songLeader', weekOf, 0, 'p3'),
      give('closingPrayer', weekOf, 0, 'p4'),
      give('greeters', weekOf, 0, 'p5'),
      give('greeters', weekOf, 1, 'p6'),
      give('communion', weekOf, 0, 'p1'),
      give('communion', weekOf, 1, 'p2'),
      give('communion', weekOf, 2, 'p7'),
      give('communion', weekOf, 3, 'p8'),
      give('announcements', next, 0, 'p2'),
      give('openingPrayer', next, 0, 'p3'),
      give('songLeader', next, 0, 'p4'),
      give('greeters', next, 0, 'p7')
    ]
  };
}

module.exports = {
  events,
  roster
};
