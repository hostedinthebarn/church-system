/* eslint-disable */
// SW-131 spike part 3: REST with a real contributor bearer token (the fallback),
// and the in-process guard (load the draft ourselves).
const test = require('node:test');
const t = require('apostrophe/test-lib/util.js');
const path = require('node:path');
let apos; const out = [];
const log = (k, v) => out.push(`${k}: ${v}`);
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

test('rest + guard', async () => {
  const m = apos.modules['@apostrophecms/event'];
  const aReq = apos.task.getReq();
  const mk = async (name, role) => {
    const u = await apos.user.insert(aReq, { ...apos.user.newInstance(), title: name, username: name, email: name + '@example.com', password: 'x-Long-Pass-12345', role });
    const token = 'tok' + name + Math.random().toString(36).slice(2);
    await apos.login.bearerTokens.insertOne({ _id: token, userId: u._id, expires: new Date(Date.now() + 3600e3) });
    return { u, token };
  };
  const admin = await mk('boss', 'admin');
  const contrib = await mk('volunteer', 'contributor');
  const adm = apos.task.getReq({ user: await apos.doc.db.findOne({ _id: admin.u._id }), mode: 'draft' });
  const seed = await m.insert(adm, { ...m.newInstance(), ...evt('Seed') });
  await m.publish(adm, seed);
  const base = apos.http.getBase();
  const call = async (method, url, token, body) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
    let b; try { b = await r.json(); } catch (e) { b = null; }
    return { status: r.status, body: b };
  };
  const id = seed._id; // en:draft
  const pubId = seed.aposDocId + ':en:published';
  const api = '/api/v1/' + '@apostrophecms/event';
  const R = async (name, p) => { const r = await p; log(name, r.status + ' ' + JSON.stringify(r.body).slice(0, 100)); return r; };
  const T = contrib.token;
  await R('REST contributor POST draft', call('POST', api + '?aposMode=draft', T, { ...evt('Via REST'), _ai: true }));
  await R('REST contributor POST published mode', call('POST', api + '?aposMode=published', T, evt('Pub REST')));
  await R('REST PATCH draft', call('PATCH', api + '/' + id + '?aposMode=draft', T, { title: 'REST patch' }));
  await R('REST PATCH :published _id', call('PATCH', api + '/' + pubId + '?aposMode=published', T, { title: 'HACK' }));
  await R('REST PATCH :published _id, aposMode=draft', call('PATCH', api + '/' + pubId + '?aposMode=draft', T, { title: 'HACK' }));
  await R('REST PATCH :published _id, no query', call('PATCH', api + '/' + pubId, T, { title: 'HACK' }));
  await R('REST PUT :published _id', call('PUT', api + '/' + pubId + '?aposMode=draft', T, { ...evt('HACK') }));
  await R('REST PATCH draft with _publish:true', call('PATCH', api + '/' + id + '?aposMode=draft', T, { title: 'REST pub', _publish: true }));
  await R('REST POST /publish', call('POST', api + '/' + id + '/publish?aposMode=draft', T, {}));
  await R('REST POST /localize es', call('POST', api + '/' + id + '/localize?aposMode=draft', T, { toLocale: 'es', update: false }));
  await R('REST POST /publish es', call('POST', api + '/' + seed.aposDocId + ':es:draft/publish?aposMode=draft&aposLocale=es', T, {}));
  await R('REST POST /submit', call('POST', api + '/' + id + '/submit?aposMode=draft', T, {}));
  await R('REST DELETE draft', call('DELETE', api + '/' + id + '?aposMode=draft', T, {}));
  await R('REST admin PATCH published (control)', call('PATCH', api + '/' + pubId + '?aposMode=published', admin.token, { title: 'Admin ok' }));
  const pub = await apos.doc.db.findOne({ _id: pubId });
  log('published title now', pub && pub.title);
  const pubs = await apos.doc.db.find({ aposMode: 'published', title: { $in: [ 'HACK', 'Via REST', 'Pub REST', 'REST pub' ] } }).toArray();
  log('hacked/leaked published docs', pubs.length);
  const ub = await apos.doc.db.findOne({ aposDocId: seed.aposDocId, aposMode: 'draft', aposLocale: 'en:draft' });
  log('REST draft updatedBy', ub && JSON.stringify(ub.updatedBy));

  // In-process guard: load the draft ourselves, in draft mode
  const cap = { ...(await apos.doc.db.findOne({ _id: admin.u._id })), role: 'contributor' };
  const dReq = apos.task.getReq({ user: cap, mode: 'draft' });
  const viaFind = await m.find(dReq, { _id: pubId }).toObject();
  log('find(draft req, published _id) returns', viaFind ? viaFind._id : null);
  const viaAposDocId = await m.find(dReq, { aposDocId: seed.aposDocId }).toObject();
  log('find(draft req, aposDocId) returns', viaAposDocId ? viaAposDocId._id : null);
});
