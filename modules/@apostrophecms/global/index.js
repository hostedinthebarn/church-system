// Site-wide settings the office edits. The logo is content uploaded to the
// deployed site, never a file in the repo: it is the church's mark and is not
// covered by this project's MIT licence. Empty in dev, tests and CI, where the
// site's name stands in as text.
//
// The service times, contact details, Give link and email-list link (LGC-33)
// are also edited here. Left empty, the site's config (sites/<name>/config.js)
// supplies them: see church-site's `info` method.
module.exports = {
  fields: {
    add: {
      serviceTimes: {
        type: 'array',
        label: 'church:settingsServiceTimes',
        help: 'church:settingsServiceTimesHelp',
        titleField: 'label',
        group: 'details',
        fields: {
          add: {
            label: {
              type: 'string',
              label: 'church:settingsServiceLabel',
              required: true
            },
            time: {
              type: 'string',
              label: 'church:settingsServiceTime',
              required: true
            }
          }
        }
      },
      address: {
        type: 'string',
        label: 'church:settingsAddress',
        group: 'details'
      },
      phone: {
        type: 'string',
        label: 'church:phone',
        group: 'details'
      },
      email: {
        type: 'string',
        label: 'church:email',
        group: 'details'
      },
      giveUrl: {
        type: 'url',
        label: 'church:settingsGiveUrl',
        help: 'church:settingsGiveUrlHelp',
        group: 'details'
      },
      mailchimpUrl: {
        type: 'url',
        label: 'church:settingsMailchimpUrl',
        help: 'church:settingsMailchimpUrlHelp',
        group: 'details'
      },
      logo: {
        type: 'attachment',
        label: 'Logo',
        group: 'images',
        help: 'Upload the largest version you have: it is also printed on the bulletin cover. PNG, JPG, WebP or SVG.'
      },
      logoAlt: {
        type: 'string',
        label: 'Logo description (alt text)',
        help: 'Read aloud by screen readers. Leave empty to use the church\'s name.'
      }
    },
    group: {
      details: {
        label: 'church:settingsDetails',
        fields: [ 'serviceTimes', 'address', 'phone', 'email', 'giveUrl', 'mailchimpUrl' ]
      }
    }
  }
};
