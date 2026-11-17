/* eslint-disable */
// SW-131 spike part 2: every publish route, locales, versions and _ai.
const test = require('node:test');
const t = require('apostrophe/test-lib/util.js');
const path = require('node:path');

let apos; const out = [];
const log = (k, v) => out.push(`${k}: ${v}`);
async function attempt(name, fn) {
  try { const r = await fn(); if (global.__id) { const ds = await apos.doc.db.find({ aposDocId: global.__id }).toArray(); log('   state', ds.map(d => d.aposMode + ':' + d.title + (d.archived ? ':archived' : '')).join(' | ')); } log(name, 'OK ' + (r && r._id ? r._id : '')); return r; } catch (e) {
    log(name, 'REFUSED ' + (e.name || '') + ' ' + String(e.message || '').slice(0, 80)); }
}
const evt = (title, d = '2026-12-01') => ({ title, startDate: d, startTime: '10:00', endTime: '11:00', dateType: 'single', allDay: false });

test.before(async () => {
  apos = await t.create({
    root: { filename: path.join(__dirname, '..', 'app.js'), require },
    modules: {
      '@apostrophecms/i18n': { options: { defaultLocale: 'en', locales: { en: {}, es: { prefix: '/es' } } } },
      'church-site': { options: { site: require('../sites/la-grange/config.js') } },
      '@apostrophecms/event': {}, '@apostrophecms/event-page': {}
    }
  });
});
test.after(async () => { console.log('\n=== RESULTS ===\n' + out.join('\n')); await t.destroy(apos); });

test('routes', async () => {
  const m = apos.modules['@apostrophecms/event'];
  const aReq = apos.task.getReq();
  const u = await apos.user.insert(aReq, { ...apos.user.newInstance(), title: 'Real Admin', username: 'ra', email: 'a@example.com', password: 'x-Long-Pass-12345', role: 'admin' });
  const admin = await apos.doc.db.findOne({ _id: u._id });
  const cap = { ...admin, role: 'contributor' };
  const dReq = apos.task.getReq({ user: cap, mode: 'draft' });
  const pReq = apos.task.getReq({ user: cap, mode: 'published' });
  const adm = apos.task.getReq({ user: admin, mode: 'draft' });

  // an already-published event made by the real admin, plus a fresh capped draft
  const pubSeed = await m.insert(adm, { ...m.newInstance(), ...evt('Seed') });
  await m.publish(adm, pubSeed);
  global.__id = pubSeed.aposDocId;
  const seedPub = await apos.doc.db.findOne({ aposDocId: pubSeed.aposDocId, aposMode: 'published' });
  log('seed published exists', !!seedPub);
  const seedDraft = await apos.doc.db.findOne({ aposDocId: pubSeed.aposDocId, aposMode: 'draft', aposLocale: 'en:draft' });

  // A. edit the published copy
  await attempt('update on :published (published req)', () => m.update(pReq, { ...seedPub, title: 'HACK1' }));
  await attempt('update on :published doc with draft req', () => m.update(dReq, { ...seedPub, title: 'HACK2' }));
  await attempt('insert in published mode', () => m.insert(pReq, { ...m.newInstance(), ...evt('HACK3') }));
  // B. publish routes
  await attempt('publish(req, draft)', () => m.publish(dReq, seedDraft));
  await attempt('update(draft, {_publish:true})', () => m.update(dReq, { ...seedDraft, title: 'HACK4', _publish: true }));
  await attempt('insert with _publish:true', () => m.insert(dReq, { ...m.newInstance(), ...evt('HACK5'), _publish: true }));
  await attempt('insert(req, doc, {publish})', () => m.insert(dReq, { ...m.newInstance(), ...evt('HACK5b'), _publish: true }, { publish: true }));
  await attempt('unpublish', () => m.unpublish && m.unpublish(dReq, seedDraft));
  await attempt('revertDraftToPublished', () => m.revertDraftToPublished(dReq, seedDraft));
  await attempt('delete published', () => m.delete(pReq, seedPub));
  await attempt('delete draft (capped)', () => m.delete(dReq, seedDraft));
  const after = await apos.doc.db.find({ aposDocId: pubSeed.aposDocId }).toArray();
  log('seed docs after attempts', JSON.stringify(after.map(d => ({ id: d._id, title: d.title, lastPublishedAt: !!d.lastPublishedAt }))));
  for (const k of [ 'HACK4', 'HACK5', 'HACK5b' ]) {
    const hs = await apos.doc.db.find({ title: k }).toArray();
    log('docs titled ' + k, JSON.stringify(hs.map(d => d._id)));
  }
  // C. localize + publish
  const cDraft = await m.insert(dReq, { ...m.newInstance(), ...evt('Capped draft', '2026-12-03') });
  const es = await attempt('localize to es (capped)', () => m.localize(dReq, cDraft, 'es', { update: false }));
  const esReq = apos.task.getReq({ user: cap, mode: 'draft', locale: 'es' });
  if (es) {
    await attempt('publish es draft', () => m.publish(esReq, es));
    await attempt('es update draft', () => m.update(esReq, { ...es, title: 'Hola' }));
  }
  await attempt('localize an already-published doc as capped (es)', () => m.localize(dReq, seedDraft, 'es', { update: true }));
  const pubEn = await apos.doc.db.findOne({ aposDocId: cDraft.aposDocId, aposMode: 'published' });
  log('capped draft ever published', !!pubEn);
  const pubEs = await apos.doc.db.find({ aposDocId: cDraft.aposDocId, aposMode: 'published' }).toArray();
  log('published copies of capped doc (any locale)', pubEs.length);
  // D. submit flow
  await attempt('submit (capped)', () => m.submit && m.submit(dReq, cDraft));
  // E. archive
  await attempt('archive draft', () => m.archive ? m.archive(dReq, cDraft) : 'n/a');
  // F. permission matrix
  for (const a of [ 'view', 'edit', 'publish', 'delete', 'upload-attachment' ]) {
    log(`can ${a} on draft`, apos.permission.can(dReq, a, cDraft));
    log(`can ${a} on published`, apos.permission.can(pReq, a, seedPub));
  }
  // G. versions + _ai
  const aiReq = apos.task.getReq({ user: cap, mode: 'draft' });
  aiReq.aposAi = true;
  const d2 = await m.insert(aiReq, { ...m.newInstance(), ...evt('AI draft', '2026-12-05') });
  await m.update(aiReq, { ...d2, title: 'AI draft v2' });
  const noAi = apos.task.getReq({ user: cap, mode: 'draft' });
  const d3 = await m.insert(noAi, { ...m.newInstance(), ...evt('Human draft', '2026-12-06') });
  for (const d of [ d2, d3 ]) {
    const vs = await apos.db.collection('aposDocsVersions').find({ docId: d._id }).toArray();
    log('versions for ' + d.title, JSON.stringify(vs.map(v => ({ author: v.author, authorId: v.authorId, ai: v.ai, mode: v.mode, locale: v.locale, keys: Object.keys(v).join(',') }))));
  }
  // Does version author show the real person, and what if admin then publishes?
  await m.publish(adm, d2);
  const vs2 = await apos.db.collection('aposDocsVersions').find({ docId: { $regex: '^' + d2.aposDocId } }).toArray();
  log('versions after admin publishes AI draft', JSON.stringify(vs2.map(v => ({ id: v._id, author: v.author, ai: v.ai, mode: v.mode }))));
  const cols = (await apos.db.listCollections().toArray()).map(c => c.name).filter(n => /ersion/i.test(n));
  log('version collections', cols.join(','));
});
