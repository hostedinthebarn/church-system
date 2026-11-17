// HTML for the bulletin: the public web page, and the sheet (the two 14 x 8.5
// in pages) used by the print route, the PDF and the editor's preview. All
// text is escaped here; nothing typed by the office reaches the page raw.
import { PAGES, SHEET } from './layout.js';

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Reading order: the cover, the prayer flap, the inside spread left to right,
// then the back. Panels are written in this order and placed on the sheet with
// grid columns, so a screen reader and the tagged PDF read it in order.
export const READING_ORDER = [ 'cover', 'flap', 'left', 'middle', 'right', 'back' ];

function multiline(text) {
  return esc(text).replace(/\n/g, '<br>');
}

function unfilledHtml(mode) {
  return mode === 'print'
    ? '<span class="blank" aria-hidden="true">__________</span>'
    : '<span class="unfilled">unfilled</span>';
}

function eventHtml(item) {
  const status = item.statusLabel ? `<strong class="status">${esc(item.statusLabel)}:</strong> ` : '';
  const where = item.location ? `, ${esc(item.location)}` : '';
  return `<li>${status}<span class="when">${esc(item.when)}</span> ${esc(item.title)}${where}</li>`;
}

export function blockHtml(block, mode = 'website') {
  switch (block.type) {
    case 'text':
      return `<p>${multiline(block.text)}</p>`;
    case 'subheading':
      return `<h3>${esc(block.text)}</h3>`;
    case 'date':
      return `<p class="figures-date">${esc(block.text)}</p>`;
    case 'list':
      return `<ul>${block.items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>`;
    case 'events':
      return `<ul class="events">${block.items.map(eventHtml).join('')}</ul>`;
    case 'dated':
      return `<ul>${block.items.map(item => `<li>${esc(item.text)} <span class="when">(${esc(item.kind)}, ${esc(item.date.slice(5))})</span></li>`).join('')}</ul>`;
    case 'serving':
      return block.groups.map(group => `<h3>${esc(group.heading)}</h3>
<dl class="serving">${group.rows.map(row => `<dt>${esc(row.label)}</dt><dd>${
  row.names.map(name => (name === null ? unfilledHtml(mode) : esc(name))).join(', ')
}</dd>`).join('')}</dl>`).join('');
    default:
      throw new RangeError(`Unknown block type "${block.type}"`);
  }
}

function sectionHtml(section, mode) {
  const body = section.blocks.map(block => blockHtml(block, mode)).join('\n');
  const empty = section.empty && mode === 'preview' ? '<p class="empty">Nothing here yet.</p>' : '';
  const heading = section.id === 'cover' ? '' : `<h2 class="band">${esc(section.title)}</h2>`;
  return `<section class="sec sec--${esc(section.id)}" data-section="${esc(section.id)}">${heading}${body}${empty}</section>`;
}

const LOGO = `<svg class="logo" viewBox="0 0 64 64" role="img" aria-label="Church logo (placeholder)">
<circle cx="32" cy="40" r="14" fill="#c9a227"/><rect x="29" y="6" width="6" height="40" fill="#1a1a1a"/>
<rect x="20" y="16" width="24" height="6" fill="#1a1a1a"/><rect x="4" y="48" width="56" height="4" fill="#1a1a1a"/></svg>`;

function coverHeader(view, site) {
  return `<header class="cover-head">${LOGO}
<p class="church">${esc(site.name || '')}</p>
<p class="tagline">${esc(site.tagline || '')}</p>
<p class="date">${esc(view.heading)}</p></header>`;
}

// mode: 'print' | 'preview'. `view` comes from viewFor(model, 'print').
export function renderSheet(view, { site = {}, mode = 'print', pages = PAGES } = {}) {
  const bySection = panel => view.sections.filter(section => section.panel === panel);
  const panelHtml = (page, panel, column) => {
    const inner = bySection(panel.id).map(section => sectionHtml(section, mode)).join('\n');
    const head = panel.id === 'cover' ? coverHeader(view, site) : '';
    return `<section class="panel panel--${panel.id}" data-panel="${panel.id}" aria-label="${esc(panel.label)} panel" style="grid-column:${column};grid-row:1">
<div class="panel__body" data-body>${head}${inner}</div></section>`;
  };
  return pages.map(page => {
    const columns = page.panels.map(panel => `${panel.widthIn}in`).join(' ');
    const ordered = READING_ORDER
      .map(id => page.panels.findIndex(panel => panel.id === id))
      .filter(index => index >= 0);
    const panels = ordered.map(index => panelHtml(page, page.panels[index], index + 1)).join('\n');
    return `<div class="sheet-page sheet-page--${page.id}" data-page="${page.id}" style="grid-template-columns:${columns}">\n${panels}\n</div>`;
  }).join('\n');
}

export function sheetCss({ sheet = SHEET } = {}) {
  const pad = 0.3;
  return `
@page { size: ${sheet.widthIn}in ${sheet.heightIn}in; margin: 0; }
@page outside { size: ${sheet.widthIn}in ${sheet.heightIn}in; margin: 0; }
@page inside { size: ${sheet.widthIn}in ${sheet.heightIn}in; margin: 0; }
:root { --gold: #c9a227; --ink: #1a1a1a; --paper: #fff; }
* { box-sizing: border-box; }
body { margin: 0; font: 10pt/1.3 Georgia, 'Times New Roman', serif; color: var(--ink); background: var(--paper); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet-page { display: grid; width: ${sheet.widthIn}in; height: ${sheet.heightIn}in; overflow: hidden; break-after: page; }
.sheet-page--outside { page: outside; }
.sheet-page--inside { page: inside; break-after: auto; }
.panel { position: relative; padding: ${pad}in; height: ${sheet.heightIn}in; border-right: 1px dashed transparent; }
.panel__body { height: calc(${sheet.heightIn}in - ${pad * 2}in); overflow: hidden; }
.band { margin: 0.12in 0 0.05in; padding: 2px 6px; background: var(--gold); color: var(--ink); font: bold 10.5pt/1.3 Helvetica, Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.04em; }
.sec:first-child .band { margin-top: 0; }
h3 { margin: 0.08in 0 0.02in; font: bold 10pt/1.3 Helvetica, Arial, sans-serif; }
p { margin: 0 0 0.06in; }
ul, dl { margin: 0 0 0.06in; padding-left: 0.18in; }
dl.serving { padding: 0; display: grid; grid-template-columns: max-content 1fr; gap: 0 0.1in; }
dl.serving dt { font-weight: bold; }
dl.serving dd { margin: 0; }
.cover-head { text-align: center; margin-bottom: 0.1in; }
.cover-head .logo { width: 0.9in; height: 0.9in; }
.cover-head .church { font: bold 14pt/1.2 Helvetica, Arial, sans-serif; margin: 0; }
.cover-head .tagline { font-style: italic; margin: 0; }
.cover-head .date { font-weight: bold; margin-top: 0.05in; }
.figures-date { font-size: 12pt; font-weight: bold; }
.status { color: #8a1c1c; }
.blank { letter-spacing: 0; }
@media screen {
  .unfilled { background: #fde68a; padding: 0 3px; }
  .preview .sheet-page { margin: 0 0 0.3in; box-shadow: 0 0 0 1px #888; background: #fff; }
  .panel[data-overflow="true"] { outline: 3px solid #b00020; outline-offset: -3px; }
}
`;
}

// Measures each panel and reports how many lines overflow. Runs in the
// browser, on the same engine that makes the PDF. Writes data-overflow on
// each panel, fills any [data-overflow-status] list, and keeps the result on
// window.__bulletinOverflow for the editor and the tests.
export const OVERFLOW_SCRIPT = `
(function () {
  function measure() {
    var results = [];
    var panels = document.querySelectorAll('[data-panel]');
    for (var i = 0; i < panels.length; i++) {
      var panel = panels[i];
      var body = panel.querySelector('[data-body]');
      var line = parseFloat(getComputedStyle(body).lineHeight) || 16;
      var over = body.scrollHeight - body.clientHeight;
      var lines = over > 1 ? Math.ceil(over / line) : 0;
      panel.setAttribute('data-overflow', lines ? 'true' : 'false');
      panel.setAttribute('data-overflow-lines', String(lines));
      results.push({ panel: panel.getAttribute('data-panel'), lines: lines });
    }
    window.__bulletinOverflow = results;
    var list = document.querySelector('[data-overflow-status]');
    if (list) {
      list.textContent = '';
      results.forEach(function (r) {
        var li = document.createElement('li');
        li.textContent = r.panel + ': ' + (r.lines ? 'full by ' + r.lines + ' line' + (r.lines === 1 ? '' : 's') : 'fits');
        list.appendChild(li);
      });
    }
    document.dispatchEvent(new CustomEvent('bulletin:overflow', { detail: results }));
  }
  window.__measureBulletin = measure;
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(measure); } else { window.addEventListener('load', measure); }
})();
`;

// A complete page around some body HTML.
export function renderDocument({ title, lang = 'en', head = '', body, script = '' }) {
  return `<!doctype html>
<html lang="${esc(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
${head}</head>
<body>
${body}
${script ? `<script>${script}</script>` : ''}
</body></html>`;
}

const WEBSITE_CSS = `
body { max-width: 42rem; margin: 0 auto; padding: 1rem; font: 1.05rem/1.5 Georgia, serif; color: #1a1a1a; }
.demo-banner { background: #fde68a; padding: .5rem 1rem; margin: -1rem -1rem 1rem; font-family: Helvetica, Arial, sans-serif; }
h1 { font-size: 1.6rem; }
.band { background: #c9a227; color: #1a1a1a; padding: .2rem .5rem; font: bold 1.05rem Helvetica, Arial, sans-serif; text-transform: uppercase; }
dl.serving { display: grid; grid-template-columns: max-content 1fr; gap: 0 1rem; }
dl.serving dd { margin: 0; } dl.serving dt { font-weight: bold; }
.status { color: #8a1c1c; }
.cover-head { text-align: center; }
`;

// The public page: only sections with website on, in reading order.
export function renderWebsite(view, { site = {}, demoBanner = '' } = {}) {
  const rank = id => READING_ORDER.indexOf(id);
  const sections = [ ...view.sections ].sort((a, b) => rank(a.panel) - rank(b.panel) || a.order - b.order);
  const body = `${demoBanner ? `<p class="demo-banner" data-demo-banner>${esc(demoBanner)}</p>` : ''}
<main id="main">
<h1>${esc(site.name || '')} bulletin, ${esc(view.heading)}</h1>
${sections.map(section => sectionHtml(section, 'website')).join('\n')}
</main>`;
  return renderDocument({
    title: `${site.name || 'Church'} bulletin, ${view.heading}`,
    head: `<style>${WEBSITE_CSS}</style>`,
    body
  });
}
