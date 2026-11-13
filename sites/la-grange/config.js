// La Grange Church of Christ: everything that makes this one church's site,
// kept out of the generic modules (ADR-0002: "written for any church").
// To run the system for another church, copy this folder to sites/<name>/
// and start with CHURCH_SITE=<name>.
//
// The service times and contact details are the church's published ones; the
// members, events and everything else in the POC are demo data.
module.exports = {
  name: 'La Grange Church of Christ',
  shortName: 'La Grange COC',
  city: 'La Grange, Texas',
  // From the church's own site (lagrangecoc.com/location and the home page),
  // read 2026-11-13. Display only: nothing sends mail to this address.
  serviceTimes: [
    {
      label: 'Sunday Bible class',
      time: '9:00 am'
    },
    {
      label: 'Sunday worship',
      time: '10:00 am'
    },
    {
      label: 'Wednesday Bible class',
      time: '6:30 pm'
    }
  ],
  contact: {
    email: 'info@lagrangecoc.com',
    phone: '(979) 968-5676'
  },
  // The church's hosted giving form (LGC-3: stays a link out to FellowshipOne)
  giveUrl: 'https://www.fellowshiponegiving.com/App/Form/3835ceb2-5e89-498b-99e0-49c89636cc43'
};
