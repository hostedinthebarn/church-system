// Needs a database: run with MongoDB at APOS_MONGODB_URI (CI does).
// The month calendar page, /calendar (LGC-42).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  start, destroy, makeHousehold, makePerson
} = require('./helpers.js');

let apos;
let req;
let member;
const memberName = `cal-member-${Date.now()}`;

async function addEvent(extra) {
  const piece = await apos.event.insert(req, {
    ...apos.event.newInstance(),
    title: 'Event',
    startDate: '2031-05-10',
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
  await apos.doc.db.deleteMany({ type: '@apostrophecms/event' });
  // The Events page gives every event an address to link to.
  const eventsPage = await apos.page.insert(req, '_home', 'lastChild', {
    ...apos.modules['@apostrophecms/event-page'].newInstance(),
    title: 'Events',
    slug: '/events'
  });
  await apos.page.publish(req, eventsPage);
  await addEvent({ title: 'Public picnic' });
  await addEvent({
    title: 'Elders secret meeting',
    publicEvent: false,
    startDate: '2031-05-11'
  });
  await addEvent({
    title: 'Cancelled sing',
    status: 'cancelled',
    startDate: '2031-05-12'
  });
  await addEvent({
    title: 'Gospel meeting',
    dateType: 'consecutive',
    allDay: true,
    startDate: '2031-05-30',
    endDate: '2031-06-02'
  });
  // An open series: the last occurrences must show once each.
  await addEvent({
    title: 'Weekly class',
    dateType: 'repeat',
    repeatPattern: 'weekly',
    repeatEnds: 'count',
    repeatCount: 4,
    startDate: '2031-05-04'
  });
  await apos.event.insert(req, {
    ...apos.event.newInstance(),
    title: 'Draft only',
    startDate: '2031-05-13',
    startTime: '10:00:00',
    endTime: '11:00:00',
    dateType: 'single'
  });
  const household = await makeHousehold(apos, req);
  const person = await makePerson(apos, req, household, { email: `cal-${Date.now()}@example.com` });
  await apos.user.insert(req, {
    ...apos.user.newInstance(),
    title: person.title,
    username: memberName,
    email: person.email,
    role: 'guest',
    password: 'a-long-test-password-1',
    personId: person._id
  });
  member = apos.http.jar();
  await apos.http.post('/api/v1/@apostrophecms/login/login', {
    jar: member,
    body: {
      username: memberName,
      password: 'a-long-test-password-1',
      session: true
    }
  });
});
test.after(async () => {
  await destroy(apos);
});

const page = (query, options = {}) => apos.http.get(`/calendar${query}`, options);

test('anonymous visitors see public events, never a members-only title', async () => {
  const html = await page('?month=2031-05');
  assert.match(html, /Public picnic/);
  assert.doesNotMatch(html, /Elders secret meeting/);
  assert.doesNotMatch(html, /Draft only/);
  assert.match(html, /<p class="muted">Members: sign in/);
});

test('a signed-in member also sees members-only events, marked, and the response is not cached', async () => {
  const res = await page('?month=2031-05', { jar: member, fullResponse: true });
  assert.match(res.body, /Elders secret meeting/);
  assert.match(res.body, /Public picnic/);
  assert.match(res.body, /<span class="tag">Members<\/span>/);
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.doesNotMatch(res.body, /<p class="muted">Members: sign in/);
});

test('cancelled events are shown, struck through and marked in words', async () => {
  const html = await page('?month=2031-05');
  assert.match(html, /<a href="[^"]*\/events\/[^"]+"><del>Cancelled sing<\/del><\/a>\s*<span class="tag grey">Cancelled<\/span>/);
});

test('a multi-day event is on every day it touches, in both months', async () => {
  const may = await page('?month=2031-05');
  const june = await page('?month=2031-06');
  const count = (html, text) => (html.match(new RegExp(text, 'g')) || []).length;
  // Two renderings (list and grid) times the days in that month.
  assert.equal(count(may, 'Gospel meeting'), 2 * 2);
  assert.equal(count(june, 'Gospel meeting'), 2 * 2);
});

test('each occurrence of a series shows once per rendering', async () => {
  const html = await page('?month=2031-05');
  assert.equal((html.match(/Weekly class/g) || []).length, 2 * 4);
  const june = await page('?month=2031-06');
  assert.doesNotMatch(june, /Weekly class/);
});

test('the grid is a table with a caption and column headings; the days are a list', async () => {
  const html = await page('?month=2031-05');
  assert.match(html, /<caption[^>]*>May 2031<\/caption>/);
  assert.equal((html.match(/<th scope="col">/g) || []).length, 7);
  assert.match(html, /<th scope="col">Sunday<\/th>/);
  assert.match(html, /<ol class="cal-list plain">/);
  assert.match(html, /rel="prev" href="\/calendar\?month=2031-04"/);
  assert.match(html, /rel="next" href="\/calendar\?month=2031-06"/);
});

test('a bad month falls back to the current month, never an error', async () => {
  const now = new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Chicago'
  }).format(new Date());
  for (const query of [ '?month=junk', '?month=2031-13', '?month[$gt]=', '?month=99999-01', '?month=', '' ]) {
    const res = await page(query, { fullResponse: true });
    assert.equal(res.status, 200, query);
    assert.match(res.body, new RegExp(`<h2 class="cal-month">${now}</h2>`), query);
  }
});

test('the picker form redirects to the one address for a month', async () => {
  const res = await page('?m=3&y=2040', {
    fullResponse: true,
    originalResponse: true,
    redirect: 'manual'
  });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/calendar?month=2040-03');
});

test('far-off months render empty, with a message', async () => {
  for (const month of [ '2001-01', '2099-12', '1000-01', '9998-12' ]) {
    const res = await page(`?month=${month}`, { fullResponse: true });
    assert.equal(res.status, 200);
    assert.match(res.body, /No events this month/);
  }
  assert.doesNotMatch(await page('?month=1000-01'), /rel="prev"/);
});

test('the picker month names come from Intl', async () => {
  const html = await page('?month=2031-05');
  assert.match(html, /<option value="5" selected>May<\/option>/);
});
