// A span of dates when a person can't serve. Marked by them (as part of
// editing their household) or by the office; seen only by the office and the
// roster coordinator.
module.exports = {
  extend: '@apostrophecms/piece-type',
  options: {
    alias: 'awayDate',
    label: 'Away date',
    pluralLabel: 'Away dates',
    localized: false,
    viewRole: 'admin',
    editRole: 'admin',
    publishRole: 'admin',
    searchable: false
  },
  fields: {
    add: {
      title: {
        type: 'string',
        label: 'Summary',
        readOnly: true
      },
      _person: {
        type: 'relationship',
        label: 'Person',
        withType: 'person',
        max: 1,
        required: true
      },
      startDate: {
        type: 'date',
        label: 'From',
        required: true
      },
      endDate: {
        type: 'date',
        label: 'To',
        help: 'Leave blank for a single day.'
      }
    }
  },
  handlers(self) {
    // Title and checks run before Apostrophe makes the slug from the title.
    const check = (req, doc) => {
      doc.endDate = doc.endDate || doc.startDate;
      if (doc.endDate < doc.startDate) {
        throw self.apos.error('invalid', 'The last day can\'t be before the first.', {
          field: 'endDate'
        });
      }
      doc.title = doc.startDate === doc.endDate
        ? doc.startDate
        : `${doc.startDate} to ${doc.endDate}`;
    };
    return {
      beforeInsert: { check },
      beforeUpdate: { check }
    };
  }
};
