// The home page's Upcoming Events (LGC-33). Needs MongoDB at APOS_MONGODB_URI.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, destroy } = require('./helpers.js');
const { addDays } = require('@church-system/calendar-logic/src/dates.js');
const { instantToLocal } = require('@church-system/calendar-logic');

let apos;
let req;
const today = instantToLocal(new Date()).date;

async function addEvent(extra) {
  const piece = await apos.event.insert(req, {
    ...apos.event.newInstance(),
    title: 'Event',
    startDate: addDays(today, 5),
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
  await addEvent({
    title: 'Later picnic',
    startDate: addDays(today, 9)
  });
  await addEvent({ title: 'First picnic' });
  await addEvent({
    title: 'Members night',
    publicEvent: false
  });
  await addEvent({
    title: 'Cancelled sing',
    status: 'cancelled'
  });
  await addEvent({
    title: 'Regular gathering',
    regularService: true
  });
  await addEvent({
    title: 'Not announced yet',
    announceFrom: addDays(today, 3)
  });
  await addEvent({
    title: 'Announced today',
    announceFrom: today,
    startDate: addDays(today, 7)
  });
  await addEvent({
    title: 'Long past',
    startDate: addDays(today, -40)
  });
  await addEvent({
    title: 'Ends today',
    startDate: addDays(today, -1),
    endDate: today,
    dateType: 'consecutive'
  });
  await apos.event.insert(req, {
    ...apos.event.newInstance(),
    title: 'Draft only',
    startDate: addDays(today, 6),
    startTime: '10:00:00',
    endTime: '11:00:00',
    dateType: 'single'
  });
});
test.after(async () => {
  await destroy(apos);
});

const anon = () => apos.task.getReq({
  role: 'anon',
  mode: 'published'
});

test('only public, regular-free, announced, uncancelled, current events show, soonest first', async () => {
  const titles = (await apos.churchCalendar.upcomingEvents(anon())).map(e => e.title);
  assert.deepEqual(titles, [ 'Ends today', 'First picnic', 'Announced today', 'Later picnic' ]);
});

test('a signed-in member still gets the public list', async () => {
  const member = apos.task.getReq({
    role: 'guest',
    mode: 'published'
  });
  const titles = (await apos.churchCalendar.upcomingEvents(member)).map(e => e.title);
  assert.ok(!titles.includes('Members night'));
});

test('the limit applies', async () => {
  assert.equal((await apos.churchCalendar.upcomingEvents(anon(), 2)).length, 2);
});

test('the home page lists them, with the three links and no hidden events', async () => {
  const html = await apos.http.get('/', { parse: false });
  assert.match(html, /First picnic/);
  assert.doesNotMatch(html, /Members night|Cancelled sing|Regular gathering|Not announced yet|Draft only|Long past/);
  assert.match(html, /href="\/calendar"/);
  assert.match(html, /href="\/sign-in"/);
  assert.match(html, /name="robots" content="noindex/);
});

test('robots.txt disallows everything', async () => {
  const text = await apos.http.get('/robots.txt', { parse: false });
  assert.match(text, /Disallow: \//);
});
