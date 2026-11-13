// A set of people with a type. A serving group is one per serving role, and
// being in it is the eligibility to serve in that role; only the office
// manages those. A fellowship group is a men's or ladies' group, a class and
// the like.
module.exports = {
  extend: '@apostrophecms/piece-type',
  options: {
    alias: 'group',
    label: 'Group',
    pluralLabel: 'Groups',
    localized: false,
    viewRole: 'admin',
    editRole: 'admin',
    publishRole: 'admin',
    searchable: false
  },
  fields: {
    add: {
      groupType: {
        type: 'select',
        label: 'Type',
        required: true,
        def: 'fellowship',
        choices: [
          {
            label: 'Serving (office-managed)',
            value: 'serving'
          },
          {
            label: 'Fellowship',
            value: 'fellowship'
          }
        ]
      },
      _members: {
        type: 'relationship',
        label: 'Members',
        withType: 'person'
      }
    },
    group: {
      basics: {
        label: 'Group',
        fields: [ 'title', 'groupType', '_members' ]
      }
    }
  },
  handlers(self) {
    return {
      beforeSave: {
        // The type's editRole is 'admin' today, so this can't trigger. It
        // stays so that lowering editRole for fellowship groups later can't
        // quietly open up serving groups too.
        servingIsOfficeOnly(req, doc) {
          if (doc.groupType === 'serving' && req.user && req.user.role !== 'admin') {
            throw self.apos.error('forbidden', 'Only the office manages serving groups.');
          }
        }
      }
    };
  }
};
