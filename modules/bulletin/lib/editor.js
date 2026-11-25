// The office's bulletin screen: the typed boxes, the ticks, the section
// switches (read-only here: they are the church's settings) and a preview of
// the sheet with a "this panel is full" signal. English only for the POC: the
// strings are gathered in S so they can move to the i18n files together.
const {
  esc, handFields, SECTIONS, renderSheet, sheetCss, OVERFLOW_SCRIPT,
  renderDocument, viewFor, FONT_BODY, FONT_HEADING
} = require('@church-system/bulletin-logic');

// "2026-12" -> "December 2026", for the roster links.
function monthName(month) {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const S = {
  title: 'Bulletin',
  status: {
    draft: 'Draft',
    signedOff: 'Signed off',
    printed: 'Printed'
  },
  save: 'Save',
  signOff: 'Sign off',
  override: 'Sign off even though a panel is full',
  markPrinted: 'Mark as printed',
  backToDraft: 'Back to draft',
  pdf: 'Download PDF (14 x 8.5 in)',
  printPage: 'Print page',
  website: 'Website page',
  typed: 'Typed for this week',
  events: 'Events in the window',
  eventsHelp: 'Public events are ticked. A members-only event goes in the bulletin only if you tick it here.',
  includeEvent: 'In the bulletin',
  membersOk: 'Members-only: put it in the bulletin',
  noEvents: 'No events fall in the next two weeks.',
  switches: 'Where each section appears',
  switchesHelp: 'Set in the church\'s configuration, not per week.',
  print: 'Print',
  site: 'Website',
  on: 'on',
  off: 'off',
  preview: 'Preview of the printed sheet',
  panels: 'Panel fit',
  warnings: 'Check before signing off',
  saved: 'Saved.',
  failed: 'That did not work: ',
  barLabel: 'Bulletin',
  allBulletins: 'All bulletins',
  membersArea: 'Members area',
  home: 'Home',
  statusLabel: 'Status',
  nothingToCheck: 'Nothing to check.',
  fixRoster: 'Open the roster for',
  fixFigures: 'Go to the figures',
  previewHelp: 'Updates when you save.',
  actions: 'Bulletin actions',
  more: 'Print and share'
};

function label(id, text, extra = '') {
  return `<label for="${id}">${esc(text)}</label>${extra}`;
}

function handForm(hand, figuresDefault) {
  const bySection = new Map();
  for (const field of handFields()) {
    bySection.set(field.section, [ ...(bySection.get(field.section) || []), field ]);
  }
  return [ ...bySection.entries() ].map(([ sectionId, fields ]) => {
    const section = SECTIONS.find(s => s.id === sectionId);
    const inputs = fields.map(field => {
      const id = `hand-${field.key}`;
      if (field.type === 'date') {
        return `<p>${label(id, field.label)}<br><input type="date" id="${id}" data-hand="${field.key}" value="${esc(hand[field.key] || figuresDefault)}"></p>`;
      }
      return `<p>${label(id, field.label)}<br><textarea id="${id}" data-hand="${field.key}" rows="4">${esc(hand[field.key] || '')}</textarea></p>`;
    }).join('');
    return `<fieldset><legend>${esc(section.title)}</legend>${inputs}</fieldset>`;
  }).join('\n');
}

function eventsForm(candidates, choices) {
  if (!candidates.length) {
    return `<p>${esc(S.noEvents)}</p>`;
  }
  const choice = id => choices.find(c => c.eventId === id) || {};
  return `<ul class="event-ticks">${candidates.map(event => {
    const mine = choice(event.id);
    const lead = `${event.statusLabel ? `${esc(event.statusLabel)}: ` : ''}${esc(event.when)}, ${esc(event.title)}`;
    const tick = event.memberOnly
      ? `<label><input type="checkbox" data-event="${esc(event.id)}" data-kind="membersOk" ${mine.membersOk ? 'checked' : ''}> ${esc(S.membersOk)}</label>`
      : `<label><input type="checkbox" data-event="${esc(event.id)}" data-kind="include" ${event.include ? 'checked' : ''}> ${esc(S.includeEvent)}</label>`;
    return `<li>${lead} ${tick}</li>`;
  }).join('')}</ul>`;
}

function switchesTable(sections) {
  return `<ul class="switches">${sections.map(section =>
    `<li>${esc(section.title)}: ${esc(S.print)} ${section.print ? S.on : S.off}, ${esc(S.site)} ${section.website ? S.on : S.off}</li>`
  ).join('')}</ul>`;
}

const CLIENT = csrfName => `
(function () {
  var date = document.body.getAttribute('data-date');
  function token() {
    var m = document.cookie.split('; ').filter(function (c) { return c.indexOf(${JSON.stringify(csrfName)} + '=') === 0; })[0];
    return m ? decodeURIComponent(m.split('=')[1]) : '';
  }
  function say(text) { document.querySelector('[data-message]').textContent = text; }
  function post(path, body) {
    return fetch('/bulletin/' + date + '/' + path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token() },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) { throw new Error(j.message || r.status); } return j; }); });
  }
  function collect() {
    var hand = {}; var choices = {};
    document.querySelectorAll('[data-hand]').forEach(function (el) { hand[el.getAttribute('data-hand')] = el.value; });
    document.querySelectorAll('[data-event]').forEach(function (el) {
      var id = el.getAttribute('data-event');
      choices[id] = choices[id] || {};
      choices[id][el.getAttribute('data-kind')] = el.checked;
    });
    return { hand: hand, eventChoices: choices };
  }
  function run(promise, reload) {
    promise.then(function () { say(${JSON.stringify(S.saved)}); if (reload) { location.reload(); } })
      .catch(function (e) { say(${JSON.stringify(S.failed)} + e.message); });
  }
  // Fit the full-size sheet into its column. A transform, not zoom: the
  // panel-full check measures scrollHeight and must see the real size.
  var scaler = document.querySelector('[data-preview-scale]');
  function fit() {
    if (!scaler) { return; }
    var box = scaler.parentNode;
    scaler.style.transform = '';
    box.style.height = '';
    var natural = scaler.scrollWidth;
    var scale = Math.min(1, (box.clientWidth - 2) / natural);
    scaler.style.transformOrigin = 'top left';
    scaler.style.transform = 'scale(' + scale + ')';
    box.style.height = Math.ceil(scaler.scrollHeight * scale) + 'px';
  }
  fit();
  window.addEventListener('resize', fit);
  document.querySelector('[data-action="save"]').addEventListener('click', function () { run(post('save', collect()), true); });
  document.querySelectorAll('[data-status]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var override = document.querySelector('[data-override]');
      run(post('status', {
        status: btn.getAttribute('data-status'),
        override: Boolean(override && override.checked),
        overflow: window.__bulletinOverflow || []
      }), true);
    });
  });
})();
`;

// model: buildBulletin(...) result; doc: the saved bulletin or null.
function renderEditor({
  model, doc, site, date, csrfName, demoBanner, figuresDefault, logo = null, fontCss = ''
}) {
  const status = (doc && doc.status) || 'draft';
  const view = viewFor(model, 'print');
  // save() stores each typed box as a field on the doc itself (doc.devotional,
  // ...), so read them from there. Reading doc.hand showed every box empty,
  // and pressing Save then wiped the week's text.
  const hand = Object.fromEntries(handFields()
    .filter(field => doc && typeof doc[field.key] === 'string')
    .map(field => [ field.key, doc[field.key] ]));
  const choices = (doc && doc.eventChoices) || [];
  // Each warning links to where it is fixed.
  const rosterLinks = w => [ ...new Set((w.dates || [ date ]).map(day => String(day).slice(0, 7))) ]
    .map(month => `<a href="/roster/${esc(month)}">${esc(S.fixRoster)} ${esc(monthName(month))}</a>`).join(' ');
  const fixFor = {
    unfilled: null,
    'figures-date': `<a href="#hand-figuresDate">${esc(S.fixFigures)}</a>`
  };
  const warnings = model.warnings.length
    ? `<ul data-bulletin-warnings>${model.warnings.map(w =>
      `<li data-warning="${esc(w.code || '')}">${esc(w.message)}${w.code === 'unfilled' ? ` ${rosterLinks(w)}` : fixFor[w.code] ? ` ${fixFor[w.code]}` : ''}</li>`).join('')}</ul>`
    : '';
  const next = [];
  if (status !== 'draft') {
    next.push(`<button type="button" class="secondary" data-status="draft">${esc(S.backToDraft)}</button>`);
  }
  if (status !== 'signedOff') {
    next.push(`<label class="override"><input type="checkbox" data-override> ${esc(S.override)}</label>
<button type="button" class="primary" data-status="signedOff">${esc(S.signOff)}</button>`);
  }
  if (status === 'signedOff') {
    next.push(`<button type="button" class="primary" data-status="printed">${esc(S.markPrinted)}</button>`);
  }
  const body = `${demoBanner ? `<p class="demo-banner" data-demo-banner>${esc(demoBanner)}</p>` : ''}
<nav class="editor-bar" aria-label="${esc(S.barLabel)}">
<a class="back" href="/bulletin"><span aria-hidden="true">←</span> ${esc(S.allBulletins)}</a>
<span class="spacer"></span>
<a href="/members">${esc(S.membersArea)}</a>
<a href="/">${esc(S.home)}</a>
</nav>
<main id="main" class="editor">
<div class="editor-head">
<h1>${esc(S.title)}: ${esc(model.heading)}</h1>
<p class="status-line">${esc(S.statusLabel)}: <strong class="status-tag status-${esc(status)}" data-bulletin-status>${esc(S.status[status])}</strong></p>
</div>
<p class="more-phone"><a href="/bulletin/${esc(date)}/pdf">${esc(S.pdf)}</a> <a href="/bulletin/${esc(date)}/print">${esc(S.printPage)}</a> <a href="/bulletin/${esc(date)}">${esc(S.website)}</a></p>
<div role="status" data-message aria-live="polite"></div>
<section class="checks${model.warnings.length ? ' has-warnings' : ''}" aria-labelledby="warn"><h2 id="warn">${esc(S.warnings)}</h2>${warnings || `<p>${esc(S.nothingToCheck)}</p>`}</section>
<div class="editor-grid">
<div class="editor-form">
<section aria-labelledby="typed"><h2 id="typed">${esc(S.typed)}</h2>${handForm(hand, figuresDefault)}</section>
<section aria-labelledby="ev"><h2 id="ev">${esc(S.events)}</h2><p>${esc(S.eventsHelp)}</p>${eventsForm(model.eventCandidates, choices)}</section>
<details class="settings"><summary>${esc(S.switches)}</summary><p>${esc(S.switchesHelp)}</p>${switchesTable(model.sections)}</details>
</div>
<div class="editor-preview">
<section aria-labelledby="pv"><h2 id="pv">${esc(S.preview)}</h2>
<p class="help">${esc(S.previewHelp)}</p>
<h3 id="fit">${esc(S.panels)}</h3><ul class="fit" data-overflow-status aria-labelledby="fit" aria-live="polite"></ul>
<div class="preview" tabindex="0" role="region" aria-labelledby="pv"><div class="preview-scale" data-preview-scale>${renderSheet(view, {
 site,
mode: 'preview',
logo
})}</div></div></section>
</div>
</div>
<div class="action-bar" role="region" aria-label="${esc(S.actions)}">
<strong class="status-tag status-${esc(status)}" aria-hidden="true">${esc(S.status[status])}</strong>
<nav class="more" aria-label="${esc(S.more)}"><a href="/bulletin/${esc(date)}/pdf">${esc(S.pdf)}</a> <a href="/bulletin/${esc(date)}/print">${esc(S.printPage)}</a> <a href="/bulletin/${esc(date)}">${esc(S.website)}</a></nav>
<span class="spacer"></span>
<button type="button" class="secondary" data-action="save">${esc(S.save)}</button>
${next.join('\n')}
</div>
</main>`;
  const css = `${fontCss}
${sheetCss()}
html { scroll-padding-bottom: 6rem; }
body { margin: 0; }
.editor { max-width: 96rem; margin: 0 auto; padding: 1rem 1rem 0; font: 1rem/1.5 ${FONT_BODY}; color: #1d1d1f; }
.editor h1, .editor h2, .editor h3 { font-family: ${FONT_HEADING}; }
.editor h1 { margin: .5rem 0 .25rem; }
.editor h2 { font-size: 1.25rem; margin: 1.5rem 0 .5rem; }
.editor h3 { font-size: 1rem; margin: .75rem 0 .25rem; }
.status-line { margin: 0 0 .5rem; }
.status-tag { display: inline-block; padding: 0 .75rem; border: 2px solid #59256d; border-radius: 999px; color: #59256d; background: #fff; font-weight: 700; line-height: 1.7; }
.status-tag.status-signedOff { border-color: #1e6b3a; color: #1e6b3a; }
.status-tag.status-printed { border-color: #4a4a4a; color: #4a4a4a; }
.checks { margin: .75rem 0; padding: .25rem 1rem .5rem; border: 1px solid #e4dde9; border-radius: 8px; background: #faf7fc; }
.checks.has-warnings { border-left: 6px solid #b42318; }
.checks h2 { margin: .5rem 0; font-size: 1.1rem; }
.checks ul { margin: 0; padding-left: 1.25rem; }
.checks li { margin: .25rem 0; }
.checks a { color: #59256d; font-weight: 600; }
.editor-grid { display: grid; gap: 1.5rem; }
@media (min-width: 1024px) {
  .editor-grid { grid-template-columns: minmax(22rem, 2fr) 3fr; align-items: start; }
  .editor-preview { position: sticky; top: 1rem; max-height: calc(100vh - 7rem); overflow: auto; }
}
.editor-preview .help { margin: 0; color: #4a4a4a; }
.fit { display: flex; flex-wrap: wrap; gap: .25rem .75rem; margin: 0 0 .5rem; padding: 0; list-style: none; font-size: .95rem; }
.editor .preview { max-width: 100%; overflow: hidden; border: 1px solid #d9d2df; border-radius: 6px; background: #fff; }
.preview-scale { width: max-content; }
fieldset { margin: 0 0 1rem; padding: .5rem 1rem 1rem; border: 1px solid #d9d2df; border-radius: 8px; }
legend { padding: 0 .5rem; font-weight: 700; }
fieldset p { margin: .5rem 0 0; }
fieldset label { font-weight: 600; }
textarea, input[type="date"] { box-sizing: border-box; width: 100%; padding: .5rem .75rem; border: 1px solid #8a7d94; border-radius: 6px; font: 1rem/1.5 ${FONT_BODY}; }
textarea { min-height: 6rem; field-sizing: content; resize: vertical; }
input[type="date"] { width: auto; min-height: 44px; }
.event-ticks { padding-left: 1.25rem; }
.event-ticks label { display: inline-flex; align-items: center; gap: .35rem; min-height: 44px; font-weight: 600; }
.event-ticks input { width: 22px; height: 22px; accent-color: #59256d; }
.settings { margin: 1rem 0 2rem; padding: .25rem 1rem; border: 1px solid #e4dde9; border-radius: 8px; }
.settings summary { min-height: 44px; display: flex; align-items: center; font-weight: 600; cursor: pointer; }
.demo-banner { background: #fde68a; padding: .5rem 1rem; margin: 0; }
.editor-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; padding: .5rem 1rem; background: #f4eff7; border-bottom: 1px solid #ded3e6; font: 600 1rem/1.5 ${FONT_BODY}; }
.editor-bar .spacer, .action-bar .spacer { flex: 1; }
.editor-bar a { display: inline-flex; align-items: center; gap: .35rem; min-height: 44px; padding: 0 1rem; border: 2px solid #59256d; border-radius: 999px; color: #59256d; background: #fff; text-decoration: none; }
.editor-bar a:hover { background: #ebe2f1; }
.editor-bar a.back { color: #fff; background: #59256d; }
.action-bar { position: sticky; bottom: 0; z-index: 10; display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .75rem; margin: 1.5rem -1rem 0; padding: .75rem 1rem; background: #fff; border-top: 1px solid #d9d2df; box-shadow: 0 -4px 12px rgba(0, 0, 0, .06); }
.action-bar .more { display: flex; flex-wrap: wrap; gap: .25rem .75rem; }
.action-bar .more a { display: inline-flex; align-items: center; min-height: 44px; color: #59256d; font-weight: 600; }
.action-bar .override { display: inline-flex; align-items: center; gap: .35rem; min-height: 44px; font-size: .95rem; }
.action-bar .override input { width: 20px; height: 20px; accent-color: #59256d; }
.editor button { min-height: 44px; padding: 0 1.25rem; border: 2px solid #59256d; border-radius: 6px; color: #59256d; background: #fff; font: 600 1rem/1 ${FONT_BODY}; cursor: pointer; }
.editor button.primary { color: #fff; background: #59256d; }
.editor button:hover { filter: brightness(1.1); }
.editor :focus-visible { outline: 3px solid #59256d; outline-offset: 2px; box-shadow: 0 0 0 6px #f2b134; }
fieldset, .editor-grid > * { min-width: 0; }
.more-phone { display: none; }
@media (max-width: 640px) {
  .more-phone { display: flex; flex-wrap: wrap; gap: 0 1rem; margin: 0; }
  .more-phone a { display: inline-flex; align-items: center; min-height: 44px; color: #59256d; font-weight: 600; }
  .action-bar { gap: .25rem .5rem; padding: .5rem 1rem; }
  .action-bar .more, .action-bar .status-tag, .action-bar .spacer { display: none; }
  .action-bar .override { order: -1; width: 100%; min-height: 36px; }
  .action-bar button { flex: 1; }
  html { scroll-padding-bottom: 9rem; }
}
`;
  return renderDocument({
    title: `${S.title}: ${model.heading}`,
    head: `<style>${css}</style>`,
    body: `<div data-bulletin-editor>${body}</div>`,
    script: `${OVERFLOW_SCRIPT}\n${CLIENT(csrfName)}`
  }).replace('<body>', `<body data-date="${esc(date)}">`);
}

module.exports = {
  renderEditor,
  S
};
