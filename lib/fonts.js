// The church's fonts: Jost for headings and Inter for body text, both under
// the SIL Open Font License and self-hosted from node_modules (@fontsource),
// never loaded from a third-party CDN. See THIRD-PARTY-NOTICES.md.
//
// Only the Latin subset is shipped: it covers English and Spanish.
const fs = require('node:fs');
const path = require('node:path');

const WEIGHTS = [ 400, 700 ];
const FAMILIES = [
  {
    family: 'Jost',
    pkg: 'jost'
  },
  {
    family: 'Inter',
    pkg: 'inter'
  }
];

function fontsDir(pkg) {
  return path.join(path.dirname(require.resolve(`@fontsource/${pkg}/package.json`)), 'files');
}

function fileName(pkg, weight) {
  return `${pkg}-latin-${weight}-normal.woff2`;
}

// Every font file that may be served, by public file name.
function files() {
  const out = new Map();
  for (const { pkg } of FAMILIES) {
    for (const weight of WEIGHTS) {
      out.set(fileName(pkg, weight), path.join(fontsDir(pkg), fileName(pkg, weight)));
    }
  }
  return out;
}

// @font-face rules. `embed: false` points at the site's /church-fonts route
// (screen pages); `embed: true` inlines the files as data URIs so a PDF made
// from a page with no address still carries the fonts.
function fontFaceCss({ embed = false } = {}) {
  const available = files();
  const rules = [];
  for (const { family, pkg } of FAMILIES) {
    for (const weight of WEIGHTS) {
      const name = fileName(pkg, weight);
      const src = embed
        ? `data:font/woff2;base64,${fs.readFileSync(available.get(name)).toString('base64')}`
        : `/church-fonts/${name}`;
      rules.push(`@font-face { font-family: '${family}'; font-style: normal; font-weight: ${weight}; font-display: swap; src: url(${src}) format('woff2'); }`);
    }
  }
  return rules.join('\n');
}

module.exports = {
  files,
  fontFaceCss
};
