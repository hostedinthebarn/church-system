// Needs a database: run with MongoDB at APOS_MONGODB_URI (CI does).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  start, destroy, makeHousehold, makePerson
} = require('./helpers.js');
const rules = require('../lib/rules.js');
const { addDays } = require('@church-system/calendar-logic/src/dates.js');

let apos;
let req;
const soon = addDays(rules.todayIso(), 10);

async function addEvent(extra) {
  const piece = await apos.event.insert(req, {
    ...apos.event.newInstance(),
    title: 'Event',
    startDate: soon,
    startTime: '10:00:00',
    endTime: '11:00:00',
    dateType: 'single',
    ...extra
  });
  return apos.event.publish(req, piece);
}

test.before(async () => {
  apos = await start();
  req = apos.task.getReq({ mode: 'draft' });
  await addEvent({ title: 'Public picnic' });
  await addEvent({
    title: 'Members night',
    publicEvent: false
  });
  await addEvent({
    title: 'Cancelled sing',
    status: 'cancelled'
  });
  await addEvent({
    title: 'Sunday worship',
    regularService: true
  });
  await addEvent({
    title: 'Ancient history',
    startDate: '2020-01-05'
  });
  // Never published: no feed may show it.
  await apos.event.insert(req, {
    ...apos.event.newInstance(),
    title: 'Draft only',
    startDate: soon,
    startTime: '10:00:00',
    endTime: '11:00:00',
    dateType: 'single'
  });
});
test.after(async () => {
  await destroy(apos);
});

async function get(path, options = {}) {
  return apos.http.get(path, {
    fullResponse: true,
    originalResponse: true,
    ...options
  }).catch(e => e);
}

test('the public feed has public events only, cancelled ones marked, and nothing old or unpublished', async () => {
  const res = await apos.http.get('/calendar/public.ics', { fullResponse: true });
  assert.match(res.headers['content-type'], /^text\/calendar/);
  const ics = res.body;
  assert.match(ics, /SUMMARY:Public picnic/);
  assert.match(ics, /SUMMARY:Sunday worship/);
  assert.match(ics, /SUMMARY:CANCELLED: Cancelled sing/);
  assert.doesNotMatch(ics, /Members night/);
  assert.doesNotMatch(ics, /Ancient history/);
  assert.doesNotMatch(ics, /Draft only/);
  assert.match(ics, /DTSTART:\d{8}T\d{6}Z/);
});

test('a member makes, uses, replaces and turns off a private link', async () => {
  const household = await makeHousehold(apos, req);
  const person = await makePerson(apos, req, household, { email: 'feed@example.com' });
  await apos.user.insert(req, {
    ...apos.user.newInstance(),
    title: person.title,
    username: 'feed-member',
    email: person.email,
    role: 'guest',
    password: 'a-long-test-password-1',
    personId: person._id
  });
  const jar = apos.http.jar();
  await apos.http.post('/api/v1/@apostrophecms/login/login', {
    jar,
    body: {
      username: 'feed-member',
      password: 'a-long-test-password-1',
      session: true
    }
  });
  const page = await apos.http.get('/calendar/subscribe', { jar });
  assert.match(page, /\/calendar\/public\.ics/);
  assert.doesNotMatch(page, /\/calendar\/member\//);

  const made = await apos.http.post('/calendar/subscribe/new', { jar });
  const first = /https?:\/\/[^"]+\/calendar\/member\/[A-Za-z0-9_-]+\.ics/.exec(made)[0];
  const feed = await apos.http.get(new URL(first).pathname, { fullResponse: true });
  assert.equal(feed.headers['cache-control'], 'private, no-store');
  assert.match(feed.body, /SUMMARY:Members night/);
  assert.match(feed.body, /SUMMARY:Public picnic/);
  assert.doesNotMatch(feed.body, /Draft only/);

  // Only a hash is stored.
  const stored = await apos.churchCalendar.feeds.find({}).toArray();
  assert.equal(stored.length, 1);
  assert.ok(!first.includes(stored[0].hash));

  // The page doesn't show the link again.
  const again = await apos.http.get('/calendar/subscribe', { jar });
  assert.doesNotMatch(again, /\/calendar\/member\//);

  // Replacing it kills the old one.
  const second = /\/calendar\/member\/[A-Za-z0-9_-]+\.ics/.exec(await apos.http.post('/calendar/subscribe/new', { jar }))[0];
  assert.notEqual(second, new URL(first).pathname);
  const oldRes = await get(new URL(first).pathname);
  assert.equal(oldRes.status, 404);
  assert.equal((await apos.http.get(second, { fullResponse: true })).status, 200);

  // Turning it off kills the new one.
  await apos.http.post('/calendar/subscribe/off', { jar });
  assert.equal((await get(second)).status, 404);

  // A feed doesn't outlive the membership.
  await apos.http.post('/calendar/subscribe/new', { jar });
  const live = (await apos.churchCalendar.feeds.find({ revokedAt: null }).toArray())[0];
  assert.ok(live);
  await apos.doc.db.updateOne({ _id: person._id }, { $set: { inactiveReason: 'moved' } });
  assert.equal(await apos.churchCalendar.personForToken('nope'), null);
  const token = await apos.churchCalendar.makeLink(person._id);
  assert.equal(await apos.churchCalendar.personForToken(token), null);
});

test('a guessed link, and the subscribe form without signing in, get nothing', async () => {
  assert.equal((await get('/calendar/member/not-a-real-token.ics')).status, 404);
  const anon = await get('/calendar/subscribe', { redirect: 'manual' });
  assert.ok([ 302, 301 ].includes(anon.status) || anon.statusCode === 302, `status ${anon.status}`);
  const post = await get('/calendar/subscribe/new', { method: 'POST' });
  assert.ok(post.status >= 400, 'a POST without the CSRF cookie is refused');
});

test('event pages: Add to Google Calendar, cancelled and members-only handled', async () => {
  const pages = apos.modules['@apostrophecms/event-page'];
  await apos.page.insert(req, '_home', 'lastChild', {
    ...pages.newInstance(),
    title: 'Events',
    slug: '/events',
    visibility: 'public'
  });
  await apos.page.publish(req, await apos.page.find(req, { slug: '/events' }).toObject());
  const piece = await apos.event.find(apos.task.getAnonReq({ mode: 'published' }), { title: 'Public picnic' }).toObject();
  assert.ok(piece._url, 'the event has a page address');
  const html = await apos.http.get(piece._url);
  assert.match(html, /https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
  assert.match(html, /Add to Google Calendar/);

  const cancelled = await apos.event.find(apos.task.getAnonReq({ mode: 'published' }), { title: 'Cancelled sing' }).toObject();
  const cancelledHtml = await apos.http.get(cancelled._url);
  assert.match(cancelledHtml, /Cancelled/);
  assert.doesNotMatch(cancelledHtml, /calendar\.google\.com/);

  // The feed now links each event to its page.
  const feed = await apos.http.get('/calendar/public.ics');
  assert.match(feed, /URL:http:\/\/[^\r]+\/events\/public-picnic/);

  // Anonymous visitors get a 404 for a members-only event's page.
  const guest = apos.task.getReq({
    role: 'guest',
    mode: 'published'
  });
  const members = await apos.event.find(guest, { title: 'Members night' }).toObject();
  const res = await get(members._url);
  assert.equal(res.status, 404);
});
