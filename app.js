const siteName = process.env.CHURCH_SITE || 'la-grange';
const site = require(`./sites/${siteName}/config.js`);

const sessionSecret = process.env.CHURCH_SESSION_SECRET;
if (!sessionSecret && process.env.NODE_ENV === 'production') {
  throw new Error('Set CHURCH_SESSION_SECRET in production');
}

// MongoDB comes from APOS_MONGODB_URI (Apostrophe reads it itself); there is
// no other database option in this project.
require('apostrophe')({
  shortName: 'church-system',
  modules: {
    '@apostrophecms/express': {
      options: {
        port: process.env.PORT || 3000,
        // Behind a tunnel or proxy, listen on loopback only (CHURCH_ADDRESS=127.0.0.1)
        // and trust the proxy's X-Forwarded-For (CHURCH_TRUST_PROXY=1), so the
        // sign-in rate limit counts real visitors, not the proxy. Both off by default.
        ...(process.env.CHURCH_ADDRESS ? { address: process.env.CHURCH_ADDRESS } : {}),
        ...(process.env.CHURCH_TRUST_PROXY === '1' ? { trustProxy: true } : {}),
        session: { secret: sessionSecret || 'poc-dev-only-not-a-secret' }
      }
    },
    '@apostrophecms/i18n': {
      options: {
        defaultLocale: 'en',
        locales: {
          en: { label: 'English' },
          es: {
            label: 'Español',
            prefix: '/es'
          }
        }
      }
    },
    '@apostrophecms/page': {
      options: {
        types: [ {
          name: '@apostrophecms/home-page',
          label: 'Home'
        }, {
          name: '@apostrophecms/event-page',
          label: 'Events'
        } ]
      }
    },
    'church-site': { options: { site } },
    theme: {},
    'church-signin': {},
    'church-audit': {},
    'church-demo': {},
    'church-directory': {},
    person: {},
    household: {},
    'person-relationship': {},
    group: {},
    'office-note': {},
    'away-date': {},
    '@apostrophecms/event': {},
    '@apostrophecms/event-page': {},
    'church-calendar': {},
    'serving-role': {},
    roster: {},
    'bulletin-standing': {},
    bulletin: {},
    // The timer that builds the week and sends the morning reminders.
    tasks: { options: { schedule: process.env.NODE_ENV !== 'test' && process.env.CHURCH_TASKS_TIMER !== 'off' } }
  }
});
