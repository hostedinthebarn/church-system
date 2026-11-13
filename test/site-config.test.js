const test = require('node:test');
const assert = require('node:assert/strict');
const site = require('../sites/la-grange/config.js');

test('La Grange site config has what the generic templates read', () => {
  assert.ok(site.name);
  assert.ok(site.contact.email.endsWith('@example.com'));
  assert.ok(site.contact.phone);
  assert.ok(Array.isArray(site.serviceTimes) && site.serviceTimes.length > 0);
  assert.match(site.giveUrl, /^https:\/\//);
});

test('generic modules and templates never name the church', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dirs = [ 'modules/church-site', 'modules/@apostrophecms' ];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : [ p ];
  });
  for (const dir of dirs) {
    for (const file of walk(path.join(__dirname, '..', dir))) {
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /la grange|lagrange/i, `${file} names the church`);
    }
  }
});
