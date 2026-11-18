// The logo as an uploaded site setting, and the fonts (LGC-63), against a real
// database. No logo file lives in the repo: the image here is drawn in memory,
// an obviously generic grey rectangle, and uploaded the way the office would.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const t = require('apostrophe/test-lib/util.js');
const { start, destroy } = require('./helpers.js');

const DATE = '2026-11-15';

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([ Buffer.from(type), data ]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

// A solid mid-grey PNG, wide and short like a wordmark.
function placeholderPng(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([ 8, 2, 0, 0, 0 ], 8);
  const row = Buffer.concat([ Buffer.from([ 0 ]), Buffer.alloc(width * 3, 0x99) ]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([ 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A ]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

let apos;
let req;
let dir;
let jar;

async function setLogo(width, alt) {
  const file = path.join(dir, `placeholder-${width}.png`);
  fs.writeFileSync(file, placeholderPng(width, Math.round(width / 5)));
  const attachment = await apos.attachment.insert(req, {
    name: `placeholder-${width}.png`,
    path: file
  });
  const settings = await apos.global.findGlobal(req);
  await apos.global.update(req, {
    ...settings,
    logo: attachment,
    logoAlt: alt
  });
  return attachment;
}

async function clearLogo() {
  const settings = await apos.global.findGlobal(req);
  await apos.global.update(req, {
    ...settings,
    logo: null,
    logoAlt: ''
  });
}

test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logo-test-'));
  apos = await start();
  req = apos.task.getReq();
  await apos.bulletin.save(req, DATE, { hand: { announcements: 'Hello' } });
  await t.createAdmin(apos, { username: 'logo-admin' });
  jar = await t.loginAs(apos, 'logo-admin');
});
test.after(async () => {
  await destroy(apos);
  fs.rmSync(dir, {
    recursive: true,
    force: true
  });
});

// The PDF is binary: read it as bytes, not as text.
async function getPdf(path) {
  const url = `${apos.http.getBase()}${path}`;
  const response = await fetch(url, { headers: { cookie: jar.getCookieStringSync(url) } });
  assert.equal(response.status, 200);
  return Buffer.from(await response.arrayBuffer());
}

const get = path => apos.http.get(path, {
  jar,
  fullResponse: true,
  parse: false
});

test('with no logo uploaded, the site name stands in: header text, cover text, no image', async () => {
  const settings = await apos.global.findGlobal(req);
  assert.ok(!settings.logo);
  assert.equal(await apos.modules['church-site'].logo(req), null);
  const print = (await get(`/bulletin/${DATE}/print`)).body;
  assert.match(print, /class="church logo-text">La Grange Church of Christ</);
  assert.ok(!print.includes('<img'));
  const home = await apos.http.get('/', { parse: false });
  assert.match(home, /class="church-name"><strong>La Grange Church of Christ/);
  assert.ok(!home.includes('church-logo'));
});

test('an uploaded logo is read by the header, the print page and the editor; alt text defaults to the site name', async () => {
  const attachment = await setLogo(1500, '');
  const logo = await apos.modules['church-site'].logo(req);
  assert.equal(logo.alt, 'La Grange Church of Christ');
  // The original is used, not the 1140 px "full" size.
  assert.ok(logo.src.endsWith(`${attachment.name}.png`) || logo.src.includes(attachment._id));
  assert.ok(!logo.src.includes('.full.'));

  const home = await apos.http.get('/', { parse: false });
  assert.match(home, /<img class="church-logo" src="[^"]+" alt="La Grange Church of Christ">/);
  assert.ok(!home.includes('class="church-name"'));

  const print = (await get(`/bulletin/${DATE}/print`)).body;
  assert.match(print, /<img class="logo" src="[^"]+" alt="La Grange Church of Christ">/);
  const edit = (await get(`/bulletin/${DATE}/edit`)).body;
  assert.match(edit, /<img class="logo"/);

  await setLogo(1500, 'Our mark');
  assert.equal((await apos.modules['church-site'].logo(req)).alt, 'Our mark');
});

test('a larger replacement upload is accepted and used', async () => {
  const small = await setLogo(497, 'Small');
  const large = await setLogo(3000, 'Large');
  assert.notEqual(small._id, large._id);
  const logo = await apos.modules['church-site'].logo(req);
  assert.ok(logo.src.includes(large._id));
  assert.equal(logo.alt, 'Large');
});

test('the PDF embeds the uploaded logo and both fonts, and links nothing', async () => {
  await setLogo(1500, 'Our mark');
  const assets = await apos.bulletin.assets(req, { embed: true });
  assert.match(assets.logo.src, /^data:image\/png;base64,/);
  assert.ok(!/url\((?!data:)/.test(assets.fontCss));
  const model = await apos.bulletin.model(req, DATE, await apos.bulletin.findWeek(req, DATE));
  const logic = require('@church-system/bulletin-logic');
  const html = apos.bulletin.printHtml(logic.viewFor(model, 'print'), assets);
  assert.ok(!/(?:src|href)="(?:https?:)?\/\//.test(html));
  assert.ok(!html.includes('/uploads/'));

  const withLogo = await getPdf(`/bulletin/${DATE}/pdf`);
  assert.equal(withLogo.subarray(0, 5).toString(), '%PDF-');
  const text = withLogo.toString('latin1');
  assert.match(text, /\/Subtype\s*\/Image/);
  assert.match(text, /\/BaseFont\s*\/[A-Z]{6}\+Jost/);
  assert.match(text, /\/BaseFont\s*\/[A-Z]{6}\+Inter/);

  await clearLogo();
  const without = await getPdf(`/bulletin/${DATE}/pdf`);
  assert.equal(without.subarray(0, 5).toString(), '%PDF-');
  assert.ok(!/\/Subtype\s*\/Image/.test(without.toString('latin1')));
  assert.ok(without.length < withLogo.length);
  if (process.env.LOGO_TEST_SAVE_PDF) {
    fs.writeFileSync(process.env.LOGO_TEST_SAVE_PDF, withLogo);
  }
});

test('the fonts are served from the site, only the listed files', async () => {
  const ok = await apos.http.get('/church-fonts/jost-latin-700-normal.woff2', {
    fullResponse: true,
    parse: false,
    originalResponse: false
  });
  assert.equal(ok.status, 200);
  assert.match(ok.headers['content-type'], /woff2/);
  for (const name of [ 'jost-latin-400-normal.woff2', 'inter-latin-400-normal.woff2', 'inter-latin-700-normal.woff2' ]) {
    assert.equal((await apos.http.get(`/church-fonts/${name}`, { fullResponse: true, parse: false })).status, 200);
  }
  for (const bad of [ 'nope.woff2', '..%2Fpackage.json', 'jost-latin-400-normal.woff' ]) {
    await assert.rejects(() => apos.http.get(`/church-fonts/${bad}`), { status: 404 });
  }
});
