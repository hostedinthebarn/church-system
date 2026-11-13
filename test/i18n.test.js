// Placeholder-locale test: fails on any interface text in our templates that
// doesn't go through Apostrophe's i18n. Static, so it needs no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const NS = 'church';
const nsDir = path.join(root, 'modules', 'church-site', 'i18n', NS);
const SKIP_DIRS = new Set([ 'node_modules', 'public', 'data', 'apos-build', '.git', 'packages' ]);

function findTemplates(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTemplates(full, found);
    } else if (entry.name.endsWith('.html')) {
      found.push(full);
    }
  }
  return found;
}

const templates = findTemplates(path.join(root, 'modules'));
const rel = file => path.relative(root, file);
const readJson = locale => JSON.parse(fs.readFileSync(path.join(nsDir, `${locale}.json`), 'utf8'));

// Remove Nunjucks comments, tags and expressions, leaving only literal HTML.
function literalHtml(source) {
  return source
    .replace(/\{#[\s\S]*?#\}/g, '')
    .replace(/\{%[\s\S]*?%\}/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '');
}

test('we have templates to check', () => {
  assert.ok(templates.length > 0);
});

test('templates contain no hard-coded visible text', () => {
  for (const file of templates) {
    const html = literalHtml(fs.readFileSync(file, 'utf8'));
    const text = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]*>/g, '')
      .trim();
    // Punctuation between expressions (": ") is fine; words are not.
    assert.doesNotMatch(text, /\p{L}|\p{N}/u, `${rel(file)} has literal text outside __t(): "${text}"`);
  }
});

test('templates contain no hard-coded text attributes', () => {
  const attrs = /\s(alt|title|aria-label|placeholder|value)="([^"]*)"/g;
  for (const file of templates) {
    const html = literalHtml(fs.readFileSync(file, 'utf8'));
    for (const [ , name, value ] of html.matchAll(attrs)) {
      assert.equal(value.trim(), '', `${rel(file)} has literal ${name}="${value}"`);
    }
  }
});

test('every __t() key in our templates exists in en and es', () => {
  const en = readJson('en');
  const es = readJson('es');
  const used = new Set();
  for (const file of templates) {
    const source = fs.readFileSync(file, 'utf8');
    for (const [ , key ] of source.matchAll(/__t\(\s*['"]([^'"]+)['"]/g)) {
      used.add({
        key,
        file
      });
    }
    assert.ok(!/__t\(\s*[^'"\s]/.test(source), `${rel(file)} calls __t() with a non-literal key`);
  }
  for (const { key, file } of used) {
    assert.ok(key.startsWith(`${NS}:`), `${rel(file)}: "${key}" is not in the "${NS}" namespace`);
    const bare = key.slice(NS.length + 1);
    assert.ok(bare in en, `${rel(file)}: "${key}" missing from en.json`);
    assert.ok(bare in es, `${rel(file)}: "${key}" missing from es.json`);
  }
});

test('es.json has exactly the keys of en.json, none left as a copy of English', () => {
  const en = readJson('en');
  const es = readJson('es');
  assert.deepEqual(Object.keys(es).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en)) {
    assert.notEqual(es[key], en[key], `es.json "${key}" is still the English text`);
    assert.ok(es[key].trim() !== '', `es.json "${key}" is empty`);
  }
});

test('the es locale is configured and hidden', () => {
  const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(source, /es:\s*\{[^}]*prefix:\s*'\/es'/);
  const mod = require('../modules/church-site/index.js');
  assert.deepEqual(mod.options.hiddenLocales, [ 'es' ]);
});
