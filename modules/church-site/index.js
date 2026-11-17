// Generic church-system behaviour for the POC. Nothing here names a church:
// the site's details arrive as the `site` option from sites/<name>/config.js.
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const fonts = require('../../lib/fonts.js');

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml'
};

module.exports = {
  options: {
    // Spanish is configured but hidden until the church decides to use it.
    hiddenLocales: [ 'es' ]
  },
  helpers(self) {
    return {
      site() {
        return self.options.site;
      },
      // The pages' @font-face rules, linked to the self-hosted files.
      fontFaceCss() {
        return self.apos.template.safe(fonts.fontFaceCss());
      }
    };
  },
  methods(self) {
    return {
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
      hideLocales(req, res, next) {
        if (!req.user && self.options.hiddenLocales.includes(req.locale)) {
          return res.status(404).send('Not found');
        }
        return next();
      }
    };
  }
};
