// The directory PDF (LGC-46): letter size, two columns, households in surname
// order, laid out like the sheet in the members-directory mockup. It takes the
// entries from lib/directory.js `pdfEntries`, which already leave out every
// hidden field, so this file only draws.
const PDFDocument = require('pdfkit');

const PAGE = {
  width: 612,
  height: 792,
  margin: 36
};
const GUTTER = 25;
const GAP = 9;

// labels: { title, subtitle, footerLeft, footerRight, home, married, children }
//   where home, married and children are functions of one string
// birthday: (MM-DD) => text, for the viewer's language
function buildPdf({
  entries, labels, birthday, compress = true
}) {
  const doc = new PDFDocument({
    size: [ PAGE.width, PAGE.height ],
    margin: PAGE.margin,
    compress,
    info: {
      Title: labels.title,
      Author: labels.title
    }
  });
  const columnWidth = (PAGE.width - 2 * PAGE.margin - GUTTER) / 2;
  const footerTop = PAGE.height - PAGE.margin - 22;
  let page = 1;
  let column = 0;
  let y = PAGE.margin;

  const drawFooter = () => {
    doc.save();
    doc.moveTo(PAGE.margin, footerTop).lineTo(PAGE.width - PAGE.margin, footerTop).lineWidth(0.75).stroke('#000000');
    doc.font('Helvetica').fontSize(7.5).fillColor('#000000');
    doc.text(labels.footerLeft, PAGE.margin, footerTop + 4, {
      width: (PAGE.width - 2 * PAGE.margin) * 0.62,
      lineBreak: true,
      height: 20
    });
    doc.text(`${labels.footerRight}  ${page}`, PAGE.width / 2, footerTop + 4, {
      width: PAGE.width / 2 - PAGE.margin,
      align: 'right',
      height: 20
    });
    doc.restore();
  };

  // Page one carries the title; later pages start higher.
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#000000')
    .text(labels.title, PAGE.margin, y, { width: PAGE.width - 2 * PAGE.margin - 110 });
  doc.font('Helvetica').fontSize(10)
    .text(labels.subtitle, PAGE.width - PAGE.margin - 110, y + 4, {
      width: 110,
      align: 'right'
    });
  y += 24;
  doc.moveTo(PAGE.margin, y).lineTo(PAGE.width - PAGE.margin, y).lineWidth(1.5).stroke('#000000');
  y += 10;
  const firstTop = y;
  let top = firstTop;

  // Each entry is a list of lines: { text, font, size, indent }.
  const linesFor = entry => {
    const lines = [ {
      text: entry.name,
      font: 'Helvetica-Bold',
      size: 11,
      indent: 0,
      rule: true
    } ];
    const plain = text => lines.push({
      text,
      font: 'Helvetica',
      size: 9.5,
      indent: 0
    });
    if (entry.address) {
      plain(entry.address);
    }
    if (entry.homePhone) {
      plain(labels.home(entry.homePhone));
    }
    for (const adult of entry.adults) {
      const rest = [
        adult.birthday ? labels.born(birthday(adult.birthday)) : '',
        adult.cellphone,
        adult.email
      ].filter(Boolean);
      plain([ adult.name, ...rest ].join('  ·  '));
    }
    if (entry.anniversary) {
      plain(labels.married(birthday(entry.anniversary)));
    }
    if (entry.children.length) {
      lines.push({
        text: labels.children(entry.children
          .map(child => (child.birthday ? `${child.name} (${birthday(child.birthday)})` : child.name))
          .join(', ')),
        font: 'Helvetica',
        size: 9.5,
        indent: 10
      });
    }
    return lines;
  };

  const heightOf = lines => lines.reduce((sum, line) => {
    doc.font(line.font).fontSize(line.size);
    return sum + doc.heightOfString(line.text, { width: columnWidth - line.indent }) + (line.rule ? 3 : 1);
  }, 0);

  for (const entry of entries) {
    const lines = linesFor(entry);
    const height = heightOf(lines);
    if (y + height > footerTop - 8) {
      if (column === 0) {
        column = 1;
      } else {
        drawFooter();
        doc.addPage();
        page += 1;
        column = 0;
        top = PAGE.margin;
      }
      y = top;
    }
    const x = PAGE.margin + column * (columnWidth + GUTTER);
    let lineY = y;
    for (const line of lines) {
      doc.font(line.font).fontSize(line.size).fillColor('#000000');
      const h = doc.heightOfString(line.text, { width: columnWidth - line.indent });
      doc.text(line.text, x + line.indent, lineY, { width: columnWidth - line.indent });
      lineY += h;
      if (line.rule) {
        doc.moveTo(x, lineY + 1).lineTo(x + columnWidth, lineY + 1).lineWidth(0.6).stroke('#999999');
        lineY += 3;
      } else {
        lineY += 1;
      }
    }
    y += height + GAP;
  }
  drawFooter();
  return doc;
}

// The whole PDF as a Buffer.
function renderPdf(options) {
  const doc = buildPdf(options);
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

module.exports = {
  renderPdf,
  buildPdf
};
