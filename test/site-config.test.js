const test = require('node:test');
const assert = require('node:assert/strict');
const site = require('../sites/la-grange/config.js');

test('La Grange site config has what the generic templates read', () => {
  assert.ok(site.name);
  assert.match(site.contact.email, /^[^@\s]+@[^@\s]+\.[a-z]+$/);
  assert.ok(site.contact.phone);
  assert.ok(Array.isArray(site.serviceTimes) && site.serviceTimes.length > 0);
  assert.match(site.giveUrl, /^https:\/\//);
});

// Nothing outside sites/ may name this church or carry one of its settings
// (Gary, 2026-11-28: "we NEVER want to hard code things like that", after the
// time zone was found written into ten files). The values are read from the
// site config itself, so a new setting is guarded as soon as it is added.
//
// KNOWN is a ratchet: files that already break the rule, each with the task
// that fixes it. A new file fails at once; a listed file that no longer
// breaks it fails too, so it gets taken off the list. The list only shrinks.
const KNOWN = {
  // LGC-103: read site.timeZone instead.
  timeZone: [
    'lib/dates.js',
    'lib/ical.js',
    'lib/jsonld.js',
    'lib/rules.js',
    'modules/@apostrophecms/event/index.js',
    'modules/church-calendar/index.js',
    'modules/church-directory/index.js',
    'packages/calendar-logic/src/dates.js',
    'packages/tasks-logic/src/dates.js',
    'packages/tasks-logic/src/week.js'
  ],
  // LGC-103: the demo households' town belongs in the site folder.
  churchText: [
    'lib/demo-data.js',
    'lib/demo-seed/names.js'
  ]
};

function siteValues(site) {
  const values = {
    name: site.name,
    shortName: site.shortName,
    city: site.city,
    timeZone: site.timeZone,
    address: site.address,
    email: site.contact && site.contact.email,
    phone: site.contact && site.contact.phone,
    giveUrl: site.giveUrl,
    podcastUrl: site.podcastUrl,
    mailchimpUrl: site.mailchimpUrl,
    currentSiteHost: site.currentSiteUrl &&
      new URL(site.currentSiteUrl).hostname.replace(/^www\./, ''),
    tagline: site.bulletin && site.bulletin.tagline
  };
  for (const [ k, v ] of Object.entries(site.social || {})) {
    values[`social.${k}`] = v;
  }
  return Object.fromEntries(Object.entries(values).filter(([ , v ]) => typeof v === 'string' && v.length >= 4));
}

test('code outside sites/ never names the church or carries its settings', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    if (e.name === 'node_modules' || e.name === 'test' || e.name.startsWith('.')) {
      return [];
    }
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : [ p ];
  });
  const expand = f => {
    const full = path.join(root, f);
    return fs.statSync(full).isDirectory() ? walk(full) : [ full ];
  };
  const files = [ 'app.js', 'modules', 'lib', 'packages' ]
    .flatMap(expand)
    .filter(f => /\.(js|mjs|cjs|html|njk|scss|css)$/.test(f))
    .map(f => path.relative(root, f));
  const checks = Object.entries(siteValues(site))
    .map(([ key, value ]) => [ key, text => text.includes(value) ]);
  checks.push([ 'churchText', text => /la grange|lagrange/i.test(text) ]);
  const found = {};
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [ key, hit ] of checks) {
      if (hit(text)) {
        (found[key] = found[key] || []).push(file);
      }
    }
  }
  const problems = [];
  for (const [ key, list ] of Object.entries(found)) {
    for (const file of list) {
      if (!(KNOWN[key] || []).includes(file)) {
        problems.push(`${file} hard-codes the site's ${key}: read it from the site config`);
      }
    }
  }
  for (const [ key, list ] of Object.entries(KNOWN)) {
    for (const file of list) {
      if (!(found[key] || []).includes(file)) {
        problems.push(`${file} no longer hard-codes ${key}: take it off KNOWN.${key}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
