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
        } ]
      }
    },
    'church-site': { options: { site } },
    theme: {}
  }
});
