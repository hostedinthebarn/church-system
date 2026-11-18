// Made-up live problems for the weekly tasks list's system items, built round
// whichever week is asked for. Replaced by the events and Facebook work: it
// returns the same shape, [{ sourceKey, title, owner, dueDate }], one per
// Facebook post in the "not posted" list and one per event announcing this
// week with no image or no contact.
function systemConditions(weekStart) {
  return [ {
    sourceKey: 'demo-facebook:fellowship-meal',
    title: 'Facebook post failed: Fellowship meal (demo)',
    owner: null,
    dueDate: weekStart
  } ];
}

module.exports = { systemConditions };
