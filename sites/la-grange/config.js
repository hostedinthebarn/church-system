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
  timeZone: 'America/Chicago',
  // The PDF's adults' birthdays: Brynna has not said yet (2026-11-12). Set
  // adultBirthdaysInPdf to false to leave them out.
  directory: { adultBirthdaysInPdf: true },
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
  // From the church's home page, read 2026-11-13 (public-home-poc.md).
  address: '646 E Hwy 71 Business, La Grange, TX 78945',
  // The church's existing email sign-up (a link out; the list itself is part of
  // the go-live email decision, not the POC).
  currentSiteUrl: 'https://www.lagrangecoc.com',
  // The church's sermon podcast on Apple Podcasts (podcast.md, checked 2026-08-11).
  // Read from the legacy page's own links on 2026-11-27 (LGC-100).
  social: {
    facebook: 'https://www.facebook.com/lagrangecofc',
    instagram: 'https://www.instagram.com/lgcoc/',
    youtube: 'https://www.youtube.com/channel/UCeUcv3fIlNR6Bz-ytD_zwtA/videos'
  },
  podcastUrl: 'https://podcasts.apple.com/us/podcast/id1001588165',
  mailchimpUrl: 'https://lagrangecoc.us8.list-manage.com/subscribe?u=14fc3df9d155df4b78daba87d&id=6b457556b9',
  contact: {
    email: 'info@lagrangecoc.com',
    phone: '(979) 968-5676'
  },
  // The church's hosted giving form (LGC-3: stays a link out to FellowshipOne)
  // The bulletin (LGC-61). `switches` overrides a section's print and website
  // defaults, for example { prayer: { website: true } }; the defaults are in
  // packages/bulletin-logic/src/sections.js. `sources` supplies events and the
  // servers roster until those pieces exist (made-up demo data for now).
  bulletin: {
    tagline: 'Loving God. Loving Others',
    switches: {},
    sources: require('./bulletin-demo.js')
  },
  // The weekly tasks list (LGC-43). Reminders for tasks with no owner go to
  // `officeAddress`: a made-up address here, which the fake sender's outbox
  // takes. The real office address is set at deploy time. `sources` supplies
  // the live problems for system items until the events and Facebook work
  // exists (made-up demo data for now).
  tasks: {
    officeAddress: 'office@example.com',
    sources: require('./tasks-demo.js')
  },
  giveUrl: 'https://www.fellowshiponegiving.com/App/Form/3835ceb2-5e89-498b-99e0-49c89636cc43'
};
