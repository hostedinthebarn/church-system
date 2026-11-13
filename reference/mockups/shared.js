// PROTOTYPE (LGC-9): the option switcher and the English/Spanish toggle, shared by every page.
// English is in the HTML, so the page works without JavaScript. Spanish comes from es.json, keyed by data-i18n.
(function () {
  const here = location.pathname.replace(/index\.html$/, '');
  const option = (here.match(/^\/([123])\/?$/) || [])[1] || '';
  let lang = 'en';
  try { lang = localStorage.getItem('lgc-lang') || 'en'; } catch (e) { /* private mode: English */ }

  // Markup (our own HTML or es.json) is parsed and swapped in rather than assigned through innerHTML.
  const setHtml = (el, html) => el.replaceChildren(...new DOMParser().parseFromString(html, 'text/html').body.childNodes);
  const english = new Map();
  document.querySelectorAll('[data-i18n]').forEach((el) => english.set(el, el.innerHTML));
  let spanish = null;

  async function apply(next) {
    lang = next;
    try { localStorage.setItem('lgc-lang', lang); } catch (e) { /* fine */ }
    if (lang === 'es' && !spanish) {
      try { spanish = await (await fetch('/es.json')).json(); } catch (e) { spanish = {}; }
    }
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const t = lang === 'es' && spanish ? spanish[el.dataset.i18n] : null;
      setHtml(el, t || english.get(el));
    });
    const btn = document.getElementById('lang-toggle');
    if (btn) {
      btn.textContent = lang === 'es' ? 'English' : 'Español';
      btn.lang = lang === 'es' ? 'en' : 'es';
      btn.setAttribute('aria-label', lang === 'es' ? 'Switch to English' : 'Cambiar a español');
    }
  }

  const bar = document.createElement('nav');
  bar.className = 'demo-bar';
  bar.setAttribute('aria-label', 'Design options');
  const link = (href, text, n) =>
    `<a href="${href}"${n === option ? ' aria-current="page"' : ''}>${text}</a>`;
  setHtml(bar,
    link('/', '<span class="label">All&nbsp;</span>options', '') +
    '<span class="sep" aria-hidden="true"></span>' +
    link('/1/', '1', '1') + link('/2/', '2', '2') + link('/3/', '3', '3') +
    '<span class="sep" aria-hidden="true"></span>' +
    '<button type="button" id="lang-toggle" lang="es" aria-label="Cambiar a español">Español</button>');
  document.body.appendChild(bar);
  document.getElementById('lang-toggle').addEventListener('click', () => apply(lang === 'es' ? 'en' : 'es'));
  if (lang === 'es') apply('es');
})();
