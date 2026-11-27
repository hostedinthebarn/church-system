// Generic church-system behaviour for the POC. Nothing here names a church:
// the site's details arrive as the `site` option from sites/<name>/config.js.
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const fonts = require('../../lib/fonts.js');
const jsonld = require('../../lib/jsonld.js');

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml'
};

module.exports = {
  // Interface strings are also needed in the admin (field labels).
  i18n: { church: { browser: true } },
  options: {
    // Spanish is configured but hidden until the church decides to use it.
    hiddenLocales: [ 'es' ]
  },
  init(self) {
    // {{ value | churchDate('short', data.locale) }}: see lib/dates.js.
    const { formatDate } = require('../../lib/dates.js');
    self.apos.template.addFilter({
      churchDate: (value, style, locale) => formatDate(value, style, locale, self.options.site && self.options.site.timeZone)
    });
  },
  helpers(self) {
    return {
      site() {
        return self.options.site;
      },
      // Service times, contact details and links, as the office set them in
      // the site settings, falling back to the site's config.
      info(settings) {
        return self.info(settings);
      },
      // JSON-LD for the public pages (LGC-101). The home page calls
      // churchJsonLd(data), the pages that show events call
      // eventJsonLd(data, pieces). Each returns a ready <script> tag, or ''.
      churchJsonLd(data) {
        return self.apos.template.safe(self.churchJsonLd(data));
      },
      eventJsonLd(data, pieces) {
        return self.apos.template.safe(self.eventJsonLd(data, pieces));
      },
      // The pages' @font-face rules, linked to the self-hosted files.
      fontFaceCss() {
        return self.apos.template.safe(fonts.fontFaceCss());
      }
    };
  },
  methods(self) {
    return {
      info(settings) {
        const site = self.options.site;
        const set = settings || {};
        const times = (set.serviceTimes || []).filter(item => item && item.label);
        const phone = set.phone || (site.contact && site.contact.phone) || '';
        return {
          serviceTimes: times.length ? times : (site.serviceTimes || []),
          address: set.address || site.address || '',
          phone,
          // tel: links take digits and a leading plus only.
          phoneHref: phone.replace(/[^\d+]/g, ''),
          email: set.email || (site.contact && site.contact.email) || '',
          giveUrl: set.giveUrl || site.giveUrl || '',
          mailchimpUrl: set.mailchimpUrl || site.mailchimpUrl || '',
          // The church's existing website, for what the POC hasn't ported.
          currentSiteUrl: site.currentSiteUrl || ''
        };
      },
      // Absolute address for a path or an address: the configured base URL, or
      // the address the request came in on. `data.origin` is set below.
      absolute(data, url) {
        if (!url) {
          return '';
        }
        return /^https?:\/\//.test(url) ? url : `${data.origin || ''}${url}`;
      },
      // The locale prefix as a path (it is absolute when a base URL is set).
      pathPrefix(data) {
        return String(data.prefix || '').replace(/^https?:\/\/[^/]+/, '');
      },
      churchJsonLd(data) {
        const site = self.options.site;
        const settings = data.global || {};
        const geo = site.geo || {};
        const logoUrl = settings.logo && settings.logo._id
          ? self.absolute(data, self.apos.attachment.url(settings.logo, { size: 'original' }))
          : '';
        return jsonld.scriptTag([ jsonld.churchNode({
          site,
          info: self.info(settings),
          url: self.absolute(data, `${self.pathPrefix(data)}/`),
          logoUrl,
          locale: data.locale,
          latitude: settings.latitude !== undefined ? settings.latitude : geo.latitude,
          longitude: settings.longitude !== undefined ? settings.longitude : geo.longitude
        }) ]);
      },
      eventJsonLd(data, pieces) {
        const info = self.info(data.global);
        const nodes = (pieces || []).map(piece => jsonld.eventNode(piece, {
          info,
          churchName: self.options.site.name,
          url: self.absolute(data, piece._url),
          locale: data.locale
        })).filter(Boolean);
        return jsonld.scriptTag(nodes);
      },
      // The uploaded logo from the site-wide settings, as { src, alt }, or
      // null when none is set (dev, tests, CI): callers then show the church's
      // name as text. The original upload is used, so a larger replacement
      // prints sharper. With `embed`, `src` is a data URI read from storage,
      // so a PDF carries the image instead of linking to it.
      async logo(req, { embed = false } = {}) {
        const settings = await self.apos.global.findGlobal(req);
        const attachment = settings && settings.logo;
        if (!attachment || !attachment._id) {
          return null;
        }
        const alt = settings.logoAlt || self.options.site.name;
        if (!embed) {
          return {
            src: self.apos.attachment.url(attachment, { size: 'original' }),
            alt
          };
        }
        const temp = path.join(self.apos.uploadfs.getTempPath(), `logo-${self.apos.util.generateId()}.${attachment.extension}`);
        try {
          await promisify(self.apos.uploadfs.copyOut)(
            self.apos.attachment.url(attachment, {
              size: 'original',
              uploadfsPath: true
            }),
            temp
          );
          const mime = MIME[attachment.extension] || 'application/octet-stream';
          return {
            src: `data:${mime};base64,${fs.readFileSync(temp).toString('base64')}`,
            alt
          };
        } finally {
          fs.rmSync(temp, { force: true });
        }
      },
      // @font-face rules for the pages that are plain HTML (the bulletin).
      fontFaceCss(options) {
        return fonts.fontFaceCss(options);
      }
    };
  },
  routes(self) {
    const available = fonts.files();
    return {
      get: {
        // The POC is never indexed: the headers and meta tags say so, and so
        // does this (LGC-33).
        '/robots.txt': (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'),
        // Self-hosted Jost and Inter: only the files listed in lib/fonts.js.
        '/church-fonts/:file': (req, res) => {
          const file = available.get(req.params.file);
          if (!file) {
            return res.status(404).send('Not found');
          }
          res.set('Cache-Control', 'public, max-age=31536000, immutable');
          return res.type('font/woff2').sendFile(file);
        }
      }
    };
  },
  middleware(self) {
    return {
      // The POC must never be indexed, whatever the page or file.
      noindex(req, res, next) {
        res.set('X-Robots-Tag', 'noindex, nofollow');
        return next();
      },
      // Runs after Apostrophe has set req.locale and req.user. Visitors get a
      // plain 404 for a hidden locale; signed-in editors can still reach it.
      // Members (role guest) never edit, so they get the public page, not
      // Apostrophe's admin bar with its logo, language picker and account menu.
      memberScene(req, res, next) {
        if (req.user && req.user.role === 'guest') {
          req.scene = 'public';
        }
        return next();
      },
      // Our templates write links as {{ data.prefix }}/calendar so a person
      // reading Spanish (/es) stays in Spanish. Empty in English.
      linkPrefix(req, res, next) {
        req.data = req.data || {};
        req.data.prefix = req.prefix;
        // The site's own address, for the absolute URLs in structured data.
        req.data.origin = (self.apos.baseUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
        return next();
      },
      hideLocales(req, res, next) {
        if (!req.user && self.options.hiddenLocales.includes(req.locale)) {
          return res.status(404).send('Not found');
        }
        return next();
      }
    };
  }
};
