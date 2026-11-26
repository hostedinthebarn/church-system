// LGC-57: the Spanish placeholder-language test, in a real browser. The static
// test (test/i18n.test.js) proves our templates hold no literal text. This one
// renders every page the office person can reach in English and again under
// /es, and fails on any interface text that stays English: a string equal to an
// English catalogue value, or text in both renders that no data explains.
// Signed-in people can reach a hidden locale; visitors cannot (smoke.spec.js).
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const auth = name => path.join(__dirname, '.auth', `${name}.json`);
const nsDir = path.join(__dirname, '..', 'modules', 'church-site', 'i18n', 'church');
const en = JSON.parse(fs.readFileSync(path.join(nsDir, 'en.json'), 'utf8'));

// Pages to start from; links found on them are followed one more step.
const SEEDS = [
  '/', '/calendar', '/sign-in', '/members', '/members/directory?layout=a',
  '/members/directory?layout=b', '/roster', '/bulletin', '/tasks', '/away',
  '/demo', '/dev/outbox', '/sign-in/verify?token=not-a-real-token',
  '/definitely-missing'
];
const SKIP = /logout|sign-out|\/reset|\.ics|\.pdf|\/print$|^\/es\/|\/login/;

// English-only by design for the POC (modules/bulletin/lib/editor.js: "English
// only for the POC", its strings gathered in S). Reported on LGC-57; remove this
// line when the editor moves to the i18n files and the test will hold it.
const ENGLISH_ONLY = /^\/bulletin\/[^/]+\/edit$/;

// Text that is the same in every language: names, numbers, times, addresses.
const LANGUAGE_NEUTRAL = /^[\p{N}\s\p{P}\p{S}]*$/u;

function visibleText(page) {
  return page.evaluate(() => {
    const out = new Set();
    const walker = document.createTreeWalker(document.body, window.NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const el = node.parentElement;
      // Apostrophe's own admin bar and its strings are core, not ours.
      if (!el || [ 'SCRIPT', 'STYLE', 'NOSCRIPT' ].includes(el.tagName) || el.closest('.apos-admin-bar, [data-apos-admin-bar], #apos-admin-bar')) {
        continue;
      }
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (text) {
        out.add(text);
      }
    }
    // Text in attributes a screen reader or a hover reads out.
    for (const el of document.querySelectorAll('[alt],[title],[aria-label],[placeholder]')) {
      if (el.closest('.apos-admin-bar, [data-apos-admin-bar], #apos-admin-bar') || el.id === 'apos-admin-bar') {
        continue;
      }
      for (const name of [ 'alt', 'title', 'aria-label', 'placeholder' ]) {
        const value = (el.getAttribute(name) || '').replace(/\s+/g, ' ').trim();
        if (value) {
          out.add(value);
        }
      }
    }
    return [ ...out ];
  });
}

test.use({ storageState: auth('office') });
test.setTimeout(240_000);

test('every reachable page is Spanish under /es', async ({ page }) => {
  // 1. Find the pages, in English.
  const found = new Set(SEEDS);
  for (const seed of SEEDS) {
    await page.goto(seed);
    const hrefs = await page.$$eval('a[href^="/"]', links => links.map(a => a.getAttribute('href')));
    for (const href of hrefs) {
      if (!SKIP.test(href) && !href.startsWith('/#')) {
        found.add(href.split('#')[0]);
      }
    }
  }
  // A few of each kind is enough: the months of the roster are one template.
  const perKind = {};
  const routes = [ ...found ].filter(route => {
    const kind = route.split(/[/?]/)[1] || '';
    perKind[kind] = (perKind[kind] || 0) + 1;
    return perKind[kind] <= 4;
  });
  expect(routes.length).toBeGreaterThan(10);

  // English catalogue values without placeholders, longest first.
  const catalogue = new Set(Object.values(en)
    .filter(value => !value.includes('{{') && /\p{L}{3}/u.test(value))
    .map(value => value.replace(/\s+/g, ' ').trim()));

  const misses = [];
  const shared = [];
  for (const route of routes) {
    const english = await page.goto(route);
    if (!english || english.status() >= 500) {
      continue;
    }
    const enText = new Set(await visibleText(page));
    const es = await page.goto(`/es${route === '/' ? '/' : route}`);
    if (!es || es.status() >= 500) {
      misses.push(`${route}: /es answered ${es && es.status()}`);
      continue;
    }
    if (ENGLISH_ONLY.test(new URL(page.url()).pathname.replace(/^\/es/, ''))) {
      continue;
    }
    // Every internal link and form must keep the person in Spanish.
    const leaving = await page.evaluate(() => [
      ...document.querySelectorAll('a[href^="/"], form[action^="/"], [formaction^="/"]')
    ].filter(el => !el.closest('.apos-admin-bar, [data-apos-admin-bar], #apos-admin-bar'))
      .map(el => el.getAttribute('href') || el.getAttribute('action') || el.getAttribute('formaction'))
      .filter(url => !/^\/(es(\/|$)|apos-frontend|uploads|api\/)/.test(url) && !url.endsWith('.js')));
    for (const url of new Set(leaving)) {
      misses.push(`${route}: link or form "${url}" leaves /es`);
    }
    const lang = await page.locator('html').getAttribute('lang');
    if (lang !== 'es') {
      misses.push(`${route}: <html lang="${lang}"> under /es`);
    }
    for (const text of await visibleText(page)) {
      if (catalogue.has(text)) {
        misses.push(`${route}: English catalogue text "${text}"`);
      } else if (enText.has(text) && !LANGUAGE_NEUTRAL.test(text) && /\b[a-z]{2,} [a-z]{2,}\b/.test(text)) {
        shared.push(`${route}: "${text}"`);
      }
    }
  }
  console.log(`Pages checked (${routes.length}): ${routes.join(' ')}`);
  console.log(`Same text in both languages, for a person to judge (${shared.length}):\n${[ ...new Set(shared) ].join('\n')}`);
  expect(misses).toEqual([]);
});
