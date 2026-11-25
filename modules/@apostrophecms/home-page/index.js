// The public home page (LGC-33, public-home-poc.md). What the office edits is
// plain fields on the page, so both the admin and the MCP's "small page edit"
// can change them: the hero, the four mission cards and the Latest Message.
// Left empty, each shows the church's default words from the interface
// strings, so a fresh install already reads like the church's site.
//
// The live parts (Upcoming Events, service times, contact, Give, the email
// list) are not fields here: events come from the calendar, the rest from the
// site settings (global).
module.exports = {
  fields: {
    add: {
      // The hero photo and the Latest Message picture are uploads, never
      // files in the repo (it is public, and church photos show real people).
      heroImage: {
        type: 'attachment',
        fileGroup: 'images',
        label: 'church:homeHeroImageLabel',
        help: 'church:homeHeroImageHelp'
      },
      heroTitle: {
        type: 'string',
        label: 'church:homeHeroTitleLabel',
        help: 'church:homeEmptyHelp'
      },
      heroButtonLabel: {
        type: 'string',
        label: 'church:homeHeroButtonLabel'
      },
      intro: {
        type: 'string',
        textarea: true,
        label: 'church:homeIntroLabel',
        help: 'church:homeEmptyHelp'
      },
      missionCards: {
        type: 'array',
        label: 'church:homeMissionCards',
        help: 'church:homeMissionCardsHelp',
        titleField: 'title',
        max: 8,
        fields: {
          add: {
            title: {
              type: 'string',
              label: 'church:homeCardTitle',
              required: true
            },
            text: {
              type: 'string',
              textarea: true,
              label: 'church:homeCardText',
              required: true
            }
          }
        }
      },
      latestTitle: {
        type: 'string',
        label: 'church:homeLatestTitle',
        help: 'church:homeLatestHelp'
      },
      latestUrl: {
        type: 'url',
        label: 'church:homeLatestUrl'
      },
      latestImage: {
        type: 'attachment',
        fileGroup: 'images',
        label: 'church:homeLatestImageLabel',
        help: 'church:homeLatestImageHelp'
      },
      latestQuote: {
        type: 'string',
        label: 'church:homeLatestQuoteLabel',
        help: 'church:homeEmptyHelp'
      },
      latestBlurb: {
        type: 'string',
        textarea: true,
        label: 'church:homeLatestBlurb',
        help: 'church:homeEmptyHelp'
      }
    },
    group: {
      basics: {
        label: 'church:homeGroupHero',
        fields: [ 'heroImage', 'heroTitle', 'heroButtonLabel', 'intro' ]
      },
      mission: {
        label: 'church:homeGroupMission',
        fields: [ 'missionCards' ]
      },
      latest: {
        label: 'church:homeGroupLatest',
        fields: [ 'latestTitle', 'latestUrl', 'latestBlurb', 'latestImage', 'latestQuote' ]
      }
    }
  },
  handlers(self) {
    return {
      '@apostrophecms/page:serve': {
        // Upcoming Events is read at request time, so it never goes stale.
        async upcomingEvents(req) {
          if (req.data.page && req.data.page.type === self.name) {
            req.data.home = await self.apos.churchCalendar.homeEvents(req);
          }
        }
      }
    };
  }
};
