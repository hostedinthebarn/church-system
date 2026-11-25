// The office's bulletin screen: the typed boxes, the ticks, the section
// switches (read-only here: they are the church's settings) and a preview of
// the sheet with a "this panel is full" signal. English only for the POC: the
// strings are gathered in S so they can move to the i18n files together.
const {
  esc, handFields, SECTIONS, renderSheet, sheetCss, OVERFLOW_SCRIPT,
  renderDocument, viewFor, FONT_BODY, FONT_HEADING
} = require('@church-system/bulletin-logic');

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
  failed: 'That did not work: '
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
      return `<p>${label(id, field.label)}<br><textarea id="${id}" data-hand="${field.key}" rows="5" cols="60">${esc(hand[field.key] || '')}</textarea></p>`;
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
  const warnings = model.warnings.length
    ? `<ul>${model.warnings.map(w => `<li>${esc(w.message)}</li>`).join('')}</ul>`
    : '';
  const next = [];
  if (status !== 'signedOff') {
    next.push(`<button type="button" data-status="signedOff">${esc(S.signOff)}</button>
<label><input type="checkbox" data-override> ${esc(S.override)}</label>`);
  }
  if (status === 'signedOff') {
    next.push(`<button type="button" data-status="printed">${esc(S.markPrinted)}</button>`);
  }
  if (status !== 'draft') {
    next.push(`<button type="button" data-status="draft">${esc(S.backToDraft)}</button>`);
  }
  const body = `${demoBanner ? `<p class="demo-banner" data-demo-banner>${esc(demoBanner)}</p>` : ''}
<main id="main" class="editor">
<h1>${esc(S.title)}: ${esc(model.heading)}</h1>
<p>Status: <strong data-bulletin-status>${esc(S.status[status])}</strong></p>
<div role="status" data-message aria-live="polite"></div>
<section aria-labelledby="warn"><h2 id="warn">${esc(S.warnings)}</h2>${warnings || '<p>Nothing to check.</p>'}</section>
<section aria-labelledby="typed"><h2 id="typed">${esc(S.typed)}</h2>${handForm(hand, figuresDefault)}</section>
<section aria-labelledby="ev"><h2 id="ev">${esc(S.events)}</h2><p>${esc(S.eventsHelp)}</p>${eventsForm(model.eventCandidates, choices)}</section>
<p><button type="button" data-action="save">${esc(S.save)}</button> ${next.join(' ')}</p>
<p><a href="/bulletin/${esc(date)}/pdf">${esc(S.pdf)}</a> · <a href="/bulletin/${esc(date)}/print">${esc(S.printPage)}</a> · <a href="/bulletin/${esc(date)}">${esc(S.website)}</a></p>
<section aria-labelledby="sw"><h2 id="sw">${esc(S.switches)}</h2><p>${esc(S.switchesHelp)}</p>${switchesTable(model.sections)}</section>
<section aria-labelledby="fit"><h2 id="fit">${esc(S.panels)}</h2><ul data-overflow-status aria-live="polite"></ul></section>
<section aria-labelledby="pv"><h2 id="pv">${esc(S.preview)}</h2><div class="preview" tabindex="0" role="region" aria-labelledby="pv" style="overflow:auto">${renderSheet(view, {
 site,
mode: 'preview',
logo
})}</div></section>
</main>`;
  const css = `${fontCss}
${sheetCss()}
.editor { max-width: 60rem; margin: 0 auto; padding: 1rem; font: 1rem/1.5 ${FONT_BODY}; }
.editor h1, .editor h2 { font-family: ${FONT_HEADING}; }
.editor .preview { max-width: 100%; }
.demo-banner { background: #fde68a; padding: .5rem 1rem; margin: 0; }
fieldset { margin: 0 0 1rem; } textarea { max-width: 100%; }
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
