// The sheet: legal paper, 14 x 8.5 in, landscape, folded in three. Panel widths
// live here, not in the CSS, so they can be corrected when Brynna measures a
// real one. ⚠️ UNVERIFIED: the inside flap is made a little narrower so it
// folds in without buckling; the real widths and which panel sits where are
// still to be confirmed against a printed copy.
export const SHEET = { widthIn: 14, heightIn: 8.5, marginIn: 0.25 };

// Left to right as the sheet lies on the table, outside then inside.
export const PAGES = [
  {
    id: 'outside',
    label: 'Outside',
    panels: [
      { id: 'flap', label: 'Inside flap', widthIn: 4.5 },
      { id: 'back', label: 'Back', widthIn: 4.75 },
      { id: 'cover', label: 'Cover', widthIn: 4.75 }
    ]
  },
  {
    id: 'inside',
    label: 'Inside',
    panels: [
      { id: 'left', label: 'Left', widthIn: 4.66 },
      { id: 'middle', label: 'Middle', widthIn: 4.68 },
      { id: 'right', label: 'Right', widthIn: 4.66 }
    ]
  }
];

export function panelIds() {
  return PAGES.flatMap(page => page.panels.map(panel => panel.id));
}

// Checks every page's panels add up to the sheet width.
export function checkLayout(pages = PAGES, sheet = SHEET) {
  for (const page of pages) {
    const total = page.panels.reduce((sum, panel) => sum + panel.widthIn, 0);
    if (Math.abs(total - sheet.widthIn) > 0.001) {
      throw new RangeError(`Page "${page.id}" panels add up to ${total} in, not ${sheet.widthIn}`);
    }
  }
  return true;
}
