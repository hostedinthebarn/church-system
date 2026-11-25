// Puts the demo back to the seed (LGC-40). The office's "Reset demo" button
// and `node app church-demo:reset` both end here. Never called from a timer.
//
// Removed: every church record (people, households, groups, relationships,
// notes, away dates, serving roles, rosters, bulletins, standing content),
// every event, and the weekly tasks (template, weeks, reminders).
// Kept: every user account (the office's and the testers'), the sign-in
// tables, the audit trail, the Events page, the send-allowlist (which is
// configuration, not data), and any person ticked "Keep through a demo reset"
// with their household (real testers' own records). The seed is then made again with the same ids, so
// a tester who signs in as a seeded person finds the same person.
const demo = require('../demo-data.js');
const rules = require('../rules.js');

const RECORD_TYPES = [
  ...demo.RECORD_TYPES,
  'serving-role',
  'roster',
  'bulletin',
  'bulletin-standing',
  '@apostrophecms/event'
];
const COLLECTIONS = [ 'taskTemplates', 'taskWeeks', 'taskReminders' ];

// The removal alone: used by the reset, and by a full seed asked to start over.
async function wipe(apos) {
  const kept = await demo.keptRecords(apos);
  await apos.doc.db.deleteMany({
    ...kept.wipeFilter,
    type: { $in: RECORD_TYPES }
  });
  for (const name of COLLECTIONS) {
    await apos.db.collection(name).deleteMany({});
  }
}

async function resetDemo(apos, { req, today = rules.todayIso() } = {}) {
  let result;
  await apos.churchAudit.withoutAudit(async () => {
    // `reset` makes the seed wipe first (wipe() below) and then fill without
    // its "is the database empty?" check, which a kept tester's household
    // would otherwise fail, leaving no demo at all.
    result = await demo.seed(apos, {
      full: true,
      reset: true,
      today
    });
  });
  // One entry for the whole reset; the trail before it is untouched.
  await apos.churchAudit.record(req || apos.task.getReq(), 'update', {
    type: 'demo',
    _id: 'demo-reset',
    title: 'Demo data'
  }, [ {
    field: 'demo',
    old: null,
    new: `Demo reset: restored the seed (${result.households} households, ${result.people} people)`
  } ]);
  return result;
}

module.exports = {
  COLLECTIONS,
  RECORD_TYPES,
  resetDemo,
  wipe
};
