// Generic church-system behaviour for the POC. Nothing here names a church:
// the site's details arrive as the `site` option from sites/<name>/config.js.
module.exports = {
  options: {
    // Spanish is configured but hidden until the church decides to use it.
    hiddenLocales: [ 'es' ]
  },
  helpers(self) {
    return {
      site() {
        return self.options.site;
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
