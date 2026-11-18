/* eslint-disable */
// SW-131 spike: contributor cap. Throwaway. Run: node --test spike/cap.test.js
const test = require('node:test');
const { start, destroy } = require('../test-db/helpers.js');

let apos; let admin; let adminReq; let capReq;
const out = [];
const log = (k, v) => { out.push(`${k}: ${v}`); };
async function attempt(name, fn) {
  try {
    const r = await fn();
    log(name, 'OK ' + (r && r._id ? r._id : ''));
    return r;
  } catch (e) {
    log(name, 'REFUSED ' + (e.name || '') + ' ' + (e.message || '').slice(0, 80));
  }
}

test.before(async () => {
  apos = await start({
    '@apostrophecms/event': {},
    '@apostrophecms/event-page': {}
  });
  adminReq = apos.task.getReq();
  const u = await apos.user.insert(adminReq, {
    ...apos.user.newInstance(),
    title: 'Real Admin', username: 'realadmin', email: 'a@example.com', password: 'x-Long-Pass-12345', role: 'admin'
  });
  admin = await apos.doc.db.findOne({ _id: u._id });
});
test.after(async () => {
  console.log('\n=== RESULTS ===\n' + out.join('\n'));
  await destroy(apos);
});

test('cap', async () => {
  // Approach A: real user object, role overridden on a copy
  const capped = { ...admin, role: 'contributor' };
  capReq = apos.task.getReq({ user: capped, mode: 'draft' });
  log('A req.user.role', capReq.user.role);
  log('A req.mode', capReq.mode);
  for (const type of [ 'bulletin', 'event' ]) {
    const m = type === 'event' ? apos.modules['@apostrophecms/event'] : apos[type];
    log(type + ' localized', m.options.localized);
    const inst = m.newInstance();
    const doc = await attempt(`${type} draft insert (capped)`, () => m.insert(capReq, {
      ...inst, title: `T ${type}`, ...(type === 'bulletin' ? { weekOf: '2026-11-22' } : { startDate: '2026-12-01', startTime: '10:00', endTime: '11:00', dateType: 'single', allDay: false })
    }));
    if (!doc) continue;
    log(`${type} updatedBy`, JSON.stringify(doc.updatedBy));
    log(`${type} aposMode`, doc.aposMode);
    const up = await attempt(`${type} draft update`, () => m.update(capReq, { ...doc, title: 'T2 ' + type }));
    if (up) log(`${type} updatedBy after`, JSON.stringify(up.updatedBy));
    await attempt(`${type} publish() capped`, () => m.publish(capReq, doc));
    const pub = await apos.doc.db.findOne({ aposDocId: doc.aposDocId, aposMode: 'published' });
    log(`${type} published copy exists after publish attempt`, !!pub);
    const pubReq = apos.task.getReq({ user: capped, mode: 'published' });
    await attempt(`${type} localize+publish: localize to es draft`, () => m.localize(capReq, doc, 'es'));
    await attempt(`${type} insert as published mode`, () => m.insert(pubReq, { ...m.newInstance(), title: 'P', ...(type === 'bulletin' ? { weekOf: '2026-11-29' } : { startDate: '2026-12-02', startTime: '10:00', endTime: '11:00', dateType: 'single', allDay: false }) }));
    const pubDoc = await apos.doc.db.findOne({ aposDocId: doc.aposDocId, aposMode: 'published' });
    if (pubDoc) {
      await attempt(`${type} update on :published`, () => m.update(pubReq, { ...pubDoc, title: 'hacked' }));
    }
    // controls: admin publish works?
    const adm = apos.task.getReq({ user: admin, mode: 'draft' });
    await attempt(`${type} publish() as REAL admin (control)`, () => m.publish(adm, doc));
    // can() check
    log(`${type} can publish (capped)`, apos.permission.can(capReq, 'publish', doc));
    log(`${type} can edit draft (capped)`, apos.permission.can(capReq, 'edit', doc));
  }
});
