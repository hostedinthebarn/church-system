import test from 'node:test';
import assert from 'node:assert/strict';
import {
  esc, blockHtml, buildBulletin, viewFor, renderSheet, sheetCss, renderDocument, renderWebsite,
  OVERFLOW_SCRIPT, READING_ORDER, logoHtml, FONT_HEADING, FONT_BODY
} from '../src/index.js';

const site = { name: 'Test <Church>', tagline: 'Loving God' };
const events = [ {
  id: 'c', title: 'Dinner & <b>x</b>', startsAt: '2026-11-22T17:00:00Z', announceFrom: '2026-11-01T00:00:00Z',
  isRegularService: false, status: 'cancelled', location: 'Hall'
} ];
const model = buildBulletin({
  weekOf: '2026-11-15',
  events,
  site,
  hand: { announcements: '<script>alert(1)</script>\n- "quoted" & more', prayerRequests: 'Zed Prayer' },
  assignments: [ { role: 'songLeader', date: '2026-11-15', slot: 0, person: 'p' } ],
  names: { p: 'Pat <P>' }
});

test('esc', () => {
  assert.equal(esc('<a href="x">\'&</a>'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&lt;/a&gt;');
  assert.equal(esc(null), '');
});

test('blocks render and escape', () => {
  assert.equal(blockHtml({ type: 'text', text: 'a\nb<' }), '<p>a<br>b&lt;</p>');
  assert.equal(blockHtml({ type: 'subheading', text: 'S' }), '<h3>S</h3>');
  assert.equal(blockHtml({ type: 'date', text: 'D' }), '<p class="figures-date">D</p>');
  assert.equal(blockHtml({ type: 'list', items: [ 'a&' ] }), '<ul><li>a&amp;</li></ul>');
  assert.match(blockHtml({ type: 'dated', items: [ { text: 'Ann', kind: 'birthday', date: '2026-11-17' } ] }), /Ann.*birthday, 11-17/);
  assert.match(blockHtml({ type: 'events', items: [ { when: 'W', title: 'T', location: '', statusLabel: '' } ] }), /<li><span class="when">W<\/span> T<\/li>/);
  assert.throws(() => blockHtml({ type: 'nope' }), /Unknown block type/);
});

test('serving: unfilled is visible on the screen, a blank line in print', () => {
  const block = { type: 'serving', groups: [ { heading: 'H', rows: [ { label: 'L', names: [ 'A', null ] } ] } ] };
  assert.match(blockHtml(block, 'preview'), /A, <span class="unfilled">unfilled<\/span>/);
  assert.match(blockHtml(block, 'print'), /A, <span class="blank" aria-hidden="true">__________<\/span>/);
});

test('the sheet has two pages of three panels, in reading order, placed by grid column', () => {
  const html = renderSheet(viewFor(model, 'print'), { site });
  assert.equal((html.match(/class="sheet-page /g) || []).length, 2);
  assert.equal((html.match(/data-panel="/g) || []).length, 6);
  assert.match(html, /data-page="outside" style="grid-template-columns:4.5in 4.75in 4.75in"/);
  assert.match(html, /data-panel="cover"[^>]*style="grid-column:3;grid-row:1"/);
  assert.match(html, /data-panel="flap"[^>]*style="grid-column:1;grid-row:1"/);
  const order = [ ...html.matchAll(/data-panel="(\w+)"/g) ].map(m => m[1]);
  assert.deepEqual(order, [ 'cover', 'flap', 'back', 'left', 'middle', 'right' ]);
  assert.deepEqual(READING_ORDER, [ 'cover', 'flap', 'left', 'middle', 'right', 'back' ]);
  assert.match(html, /Test &lt;Church&gt;/);
  assert.match(html, /Sunday, November 15, 2026/);
  assert.ok(!html.includes('<script>alert'));
  assert.match(html, /&lt;script&gt;alert\(1\)/);
  assert.match(html, /CANCELLED:/);
  assert.match(html, /Dinner &amp; &lt;b&gt;x&lt;\/b&gt;/);
  assert.match(html, /Pat &lt;P&gt;/);
  assert.match(html, /Prayer List/);
});

test('the preview says what is empty; the print does not', () => {
  const view = viewFor(model, 'print');
  assert.match(renderSheet(view, { site, mode: 'preview' }), /Nothing here yet/);
  assert.ok(!renderSheet(view, { site, mode: 'print' }).includes('Nothing here yet'));
  const noName = renderSheet(view);
  assert.match(noName, /class="church logo-text"><\/p>/);
});

test('the cover shows the uploaded logo, or the church name as text when there is none', () => {
  const view = viewFor(model, 'print');
  const none = renderSheet(view, { site });
  assert.match(none, /<p class="church logo-text">Test &lt;Church&gt;<\/p>/);
  assert.ok(!none.includes('<img'));
  const logo = { src: 'data:image/png;base64,AAAA', alt: 'Test logo "x"' };
  const set = renderSheet(view, { site, logo });
  assert.match(set, /<img class="logo" src="data:image\/png;base64,AAAA" alt="Test logo &quot;x&quot;">/);
  assert.ok(!set.includes('logo-text'));
  // No alt text given: the church's name.
  assert.match(logoHtml({ src: '/x.png' }, 'Name'), /alt="Name"/);
  assert.match(logoHtml({ src: '/x.png' }), /alt=""/);
  assert.match(logoHtml({ src: '' }, 'Name'), /logo-text/);
});

test('the fonts are Jost for headings and Inter for body, with no CDN', () => {
  const css = sheetCss();
  assert.ok(css.includes(FONT_HEADING));
  assert.ok(css.includes(FONT_BODY));
  assert.match(FONT_HEADING, /^'Jost'/);
  assert.match(FONT_BODY, /^'Inter'/);
  assert.ok(!/Georgia|Helvetica, Arial/.test(css));
  assert.ok(!/googleapis|gstatic|typekit/.test(css));
});

test('the css sets legal landscape and keeps colour', () => {
  const css = sheetCss();
  assert.match(css, /@page \{ size: 14in 8.5in; margin: 0; \}/);
  assert.match(css, /print-color-adjust: exact/);
  assert.match(css, /page: outside/);
  assert.match(sheetCss({ sheet: { widthIn: 11, heightIn: 8.5 } }), /size: 11in 8.5in/);
});

test('overflow script and documents', () => {
  assert.match(OVERFLOW_SCRIPT, /__bulletinOverflow/);
  assert.match(OVERFLOW_SCRIPT, /full by/);
  const doc = renderDocument({ title: 'T<', body: '<p>x</p>', script: 'var a=1;' });
  assert.match(doc, /<title>T&lt;<\/title>/);
  assert.match(doc, /noindex/);
  assert.match(doc, /<script>var a=1;<\/script>/);
  assert.ok(!renderDocument({ title: 'T', body: '' }).includes('<script>'));
});

test('website: only sections switched on, reading order, no prayer list, banner and noindex', () => {
  const html = renderWebsite(viewFor(model, 'website'), { site, demoBanner: 'Demo data' });
  assert.ok(!html.includes('Prayer List'));
  assert.ok(!html.includes('Zed Prayer'));
  assert.match(html, /data-demo-banner/);
  assert.match(html, /<h1>Test &lt;Church&gt; bulletin, Sunday, November 15, 2026<\/h1>/);
  assert.match(html, /<html lang="en">/);
  assert.ok(html.indexOf('data-section="cover"') < html.indexOf('data-section="announcements"'));
  assert.ok(html.indexOf('data-section="announcements"') < html.indexOf('data-section="leadership"'));
  const bare = renderWebsite(viewFor(model, 'website'));
  assert.ok(!bare.includes('data-demo-banner'));
  assert.ok(!bare.includes('<img'));
  const withLogo = renderWebsite(viewFor(model, 'website'), {
    site,
    logo: { src: '/uploads/l.png', alt: 'Logo' },
    head: '<style>/* fonts */</style>'
  });
  assert.match(withLogo, /<img class="logo" src="\/uploads\/l.png" alt="Logo">\s*<\/p>\s*<h1>/);
  assert.match(withLogo, /\/\* fonts \*\//);
  assert.match(bare, /<title>Church bulletin/);
});
