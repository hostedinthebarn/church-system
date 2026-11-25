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
