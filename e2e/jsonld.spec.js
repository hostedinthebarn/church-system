// LGC-101: JSON-LD on the public pages. The home page carries one Church; the
// pages that list or show events carry an Event for each one-off public event
// and none for the regular services; the members' and office pages carry
// nothing. The demo events (lib/demo-data.js) are dated from today.
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const rules = require('../lib/rules.js');
const { addDays, weekdayOf } = require('@church-system/calendar-logic/src/dates.js');

const auth = name => path.join(__dirname, '.auth', `${name}.json`);
const today = rules.todayIso();
const sunday = addDays(today, (7 - weekdayOf(today)) % 7);
const meal = addDays(sunday, 13);
const singing = addDays(sunday, 16);
const gospel = addDays(sunday, 20);
const monthOf = date => date.slice(0, 7);

// Every application/ld+json block on the page, parsed. A block that is not
// valid JSON fails the test here.
async function blocks(page) {
  const texts = await page.locator('script[type="application/ld+json"]').allTextContents();
  return texts.map(text => JSON.parse(text));
}
const nodes = list => list.flatMap(block => {
  expect(block['@context']).toBe('https://schema.org');
  return block['@graph'];
});
const events = list => nodes(list).filter(node => node['@type'] === 'Event');

// The Chicago offset on a day, worked out independently of the code under test.
function offsetOn(date) {
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    timeZoneName: 'shortOffset'
  }).formatToParts(new Date(`${date}T18:00:00Z`)).find(p => p.type === 'timeZoneName').value;
  const hours = Number(part.replace('GMT', ''));
  return `${hours < 0 ? '-' : '+'}${String(Math.abs(hours)).padStart(2, '0')}:00`;
}

async function eventsAcross(page, months, path = '/calendar?month=') {
  const found = [];
  for (const month of months) {
    await page.goto(`${path}${month}`);
    found.push(...events(await blocks(page)));
  }
  return found;
}

test.describe('anonymous', () => {
  test('the home page has one block with one Church, taken from the settings', async ({ page }) => {
    await page.goto('/');
    const list = await blocks(page);
    expect(list).toHaveLength(1);
    const graph = nodes(list);
    expect(graph.map(n => n['@type'])).toEqual([ 'Church' ]);
    const church = graph[0];
    expect(church.name).toBe('La Grange Church of Christ');
    expect(church.url).toMatch(/^http:\/\/localhost:\d+\/$/);
    expect(church.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: '646 E Hwy 71 Business',
      addressLocality: 'La Grange',
      addressRegion: 'TX',
      postalCode: '78945'
    });
    expect(church.telephone).toBe('(979) 968-5676');
    expect(church.geo).toBeUndefined();
    expect(church.openingHoursSpecification.map(h => [ h.dayOfWeek, h.opens ])).toEqual([
      [ 'https://schema.org/Sunday', '09:00' ],
      [ 'https://schema.org/Sunday', '10:00' ],
      [ 'https://schema.org/Wednesday', '18:30' ]
    ]);
    // The same address and times are on the page itself.
    await expect(page.getByText('646 E Hwy 71 Business, La Grange, TX 78945')).toBeVisible();
  });

  test('the calendar and the events page mark up one-off events only', async ({ page }) => {
    const months = [ ...new Set([ meal, singing, gospel ].map(monthOf)) ];
    for (const found of [
      await eventsAcross(page, months),
      await eventsAcross(page, [ '' ], '/events')
    ]) {
      const names = found.map(e => e.name);
      expect(names).toEqual(expect.arrayContaining([ 'Fellowship meal', 'Singing night', 'Gospel meeting' ]));
      // Regular services and members-only events never appear.
      for (const name of [ 'Sunday worship', 'Wednesday Bible class', 'Elders\' meeting' ]) {
        expect(names).not.toContain(name);
      }
      const byName = Object.fromEntries(found.map(e => [ e.name, e ]));
      const dinner = byName['Fellowship meal'];
      expect(dinner.startDate).toBe(`${meal}T10:00:00${offsetOn(meal)}`);
      expect(dinner.endDate).toBe(`${meal}T11:00:00${offsetOn(meal)}`);
      expect(dinner.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode');
      expect(dinner.eventStatus).toBeUndefined();
      expect(dinner.location['@type']).toBe('Place');
      expect(dinner.location.name).toBeTruthy();
      expect(dinner.location.address.postalCode).toBe('78945');
      expect(byName['Singing night'].eventStatus).toBe('https://schema.org/EventCancelled');
      expect(byName['Gospel meeting'].startDate).toBe(gospel);
      // One block per name on a page: no duplicates.
      expect(new Set(names).size).toBe(names.length);
    }
  });

  test('an event page has one Event and a one-off event page is not a Church', async ({ page }) => {
    await page.goto('/events');
    await page.getByRole('link', { name: 'Fellowship meal' }).first().click();
    const list = await blocks(page);
    expect(list).toHaveLength(1);
    expect(nodes(list).map(n => n['@type'])).toEqual([ 'Event' ]);
    expect(nodes(list)[0].url).toBe(page.url());
  });

  test('the sign-in page has none', async ({ page }) => {
    await page.goto('/sign-in');
    expect(await blocks(page)).toHaveLength(0);
  });

});

test.describe('signed in', () => {
  test.use({ storageState: auth('member') });

  test('Spanish: the same blocks with inLanguage es', async ({ page }) => {
    await page.goto('/es');
    const graph = nodes(await blocks(page));
    expect(graph.map(n => n['@type'])).toEqual([ 'Church' ]);
    expect(graph[0].inLanguage).toBe('es');
    expect(graph[0].url).toMatch(/\/es\/$/);
    // Events are written in English only for now, so the Spanish calendar has
    // none to mark up; it must still render and carry no Church of its own.
    // (An Event in Spanish carries inLanguage: see test/jsonld.test.js.)
    await page.goto(`/es/calendar?month=${monthOf(meal)}`);
    expect(nodes(await blocks(page)).filter(n => n['@type'] === 'Church')).toHaveLength(0);
  });

  test('a member sees no members-only event marked up', async ({ page }) => {
    await page.goto(`/calendar?month=${monthOf(addDays(sunday, 9))}`);
    expect(await page.getByText('Elders\' meeting').count()).toBeGreaterThan(0);
    expect(events(await blocks(page)).map(e => e.name)).not.toContain('Elders\' meeting');
  });

  test('the members\' pages have none', async ({ page }) => {
    for (const url of [ '/members', '/members/directory?layout=a', '/roster', '/calendar/subscribe', '/away' ]) {
      await page.goto(url);
      expect(await blocks(page), url).toHaveLength(0);
    }
  });
});

test.describe('office', () => {
  test.use({ storageState: auth('office') });

  test('the office pages have none', async ({ page }) => {
    for (const url of [ '/bulletin', '/tasks', '/roster', '/members/directory?layout=a' ]) {
      await page.goto(url);
      expect(await blocks(page), url).toHaveLength(0);
    }
  });
});
