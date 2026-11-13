// La Grange Church of Christ: everything that makes this one church's site,
// kept out of the generic modules (ADR-0002: "written for any church").
// To run the system for another church, copy this folder to sites/<name>/
// and start with CHURCH_SITE=<name>.
//
// These values are made up or placeholders until the church confirms them.
// The POC runs on demo data; nothing here is a published fact.
module.exports = {
  name: 'La Grange Church of Christ',
  shortName: 'La Grange COC',
  city: 'La Grange, Texas',
  // Confirm with the office before the POC is shown to anyone: these are
  // placeholders, not the church's real times.
  serviceTimes: [
    {
      label: 'Sunday morning worship',
      time: 'To be confirmed'
    },
    {
      label: 'Sunday Bible class',
      time: 'To be confirmed'
    }
  ],
  contact: {
    // example.com never delivers mail (POC rule: no real inboxes)
    email: 'office@example.com',
    phone: '555-0100'
  },
  // The church's hosted giving form (LGC-3: stays a link out to FellowshipOne)
  giveUrl: 'https://www.fellowshiponegiving.com/App/Form/3835ceb2-5e89-498b-99e0-49c89636cc43'
};
