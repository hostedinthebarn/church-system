// The header's menu button (LGC-33). The menu is plain links that are open
// without JavaScript; this only adds the open and close on narrow screens.
export default () => {
  // The sign-in link's page (LGC-94, ADR-0002): sign in as soon as it opens.
  // A mail scanner that only fetches the link runs no script, so it can't
  // spend it; without JavaScript the page's button does the same.
  const signin = document.querySelector('[data-auto-signin]');
  if (signin) {
    signin.submit();
  }
  // The home page's floating header (LGC-100): fixed under the demo banner,
  // slides away once the page scrolls and returns at the top. Keyboard focus
  // inside it brings it back. Without this script it just scrolls with the page.
  const floating = document.querySelector('.site-header.is-overlay');
  if (floating) {
    const banner = document.querySelector('[data-demo-banner]');
    const place = () => {
      const height = banner ? banner.getBoundingClientRect().bottom + window.scrollY : 0;
      document.documentElement.style.setProperty('--banner-h', `${Math.max(0, Math.round(height))}px`);
    };
    const update = () => {
      const away = window.scrollY > 4 && !floating.contains(document.activeElement);
      floating.classList.toggle('is-hidden', away);
    };
    place();
    floating.classList.add('js-float');
    window.addEventListener('resize', place);
    window.addEventListener('scroll', update, { passive: true });
    floating.addEventListener('focusin', update);
    floating.addEventListener('focusout', () => setTimeout(update, 0));
    update();
  }
  const button = document.querySelector('[data-menu-button]');
  const nav = document.querySelector('[data-main-nav]');
  if (!button || !nav) {
    return;
  }
  document.body.classList.add('js-menu');
  button.hidden = false;
  const set = open => {
    nav.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => set(button.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      set(false);
      button.focus();
    }
  });
};
