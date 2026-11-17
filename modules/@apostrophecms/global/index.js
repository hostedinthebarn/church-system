// Site-wide settings the office edits. The logo is content uploaded to the
// deployed site, never a file in the repo: it is the church's mark and is not
// covered by this project's MIT licence. Empty in dev, tests and CI, where the
// site's name stands in as text.
module.exports = {
  fields: {
    add: {
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
    }
  }
};
