// A household owns the address, the home phone, an optional photo and the name
// shown in the directory and the PDF. Every person belongs to exactly one.
const rules = require('../../lib/rules.js');

module.exports = {
  extend: '@apostrophecms/piece-type',
  options: {
    label: 'Household',
    pluralLabel: 'Households',
    alias: 'household',
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
        label: 'Name',
        help: 'Made from the adults\' names, such as "Bailey, Gary & Shannon". Edit it and untick the box below to keep your wording.'
      },
      autoName: {
        type: 'boolean',
        label: 'Keep the name up to date from the people in it',
        def: true
      },
      address: {
        type: 'object',
        label: 'Address',
        fields: {
          add: {
            street: {
              type: 'string',
              label: 'Street'
            },
            city: {
              type: 'string',
              label: 'City'
            },
            state: {
              type: 'string',
              label: 'State'
            },
            zip: {
              type: 'string',
              label: 'Zip code'
            }
          }
        }
      },
      homePhone: {
        type: 'string',
        label: 'Home phone'
      },
      _photo: {
        type: 'relationship',
        label: 'Photo',
        withType: '@apostrophecms/image',
        max: 1
      },
      directoryOptOut: {
        type: 'boolean',
        label: 'Leave this household out of the directory',
        def: false
      }
    },
    group: {
      basics: {
        label: 'Household',
        fields: [ 'title', 'autoName', 'address', 'homePhone', '_photo', 'directoryOptOut' ]
      }
    }
  },
  handlers(self) {
    return {
      beforeInsert: {
        defaultTitle(req, doc) {
          doc.title = doc.title || 'New household';
        }
      }
    };
  },
  methods(self) {
    return {
      async peopleIn(householdId) {
        return self.apos.doc.db.find({
          type: 'person',
          householdIds: householdId
        }).sort({
          dateOfBirth: 1,
          firstName: 1
        }).toArray();
      },
      // Rewrites the generated name after someone joins, changes or leaves.
      // A household whose name the office has taken over is left alone. The
      // update goes straight to the database, so it writes its own audit
      // entry.
      async refreshName(req, householdId) {
        if (!householdId) {
          return;
        }
        const household = await self.apos.doc.db.findOne({
          _id: householdId,
          type: 'household'
        });
        if (!household || household.autoName === false) {
          return;
        }
        const name = rules.householdName(await self.peopleIn(householdId));
        if (!name || name === household.title) {
          return;
        }
        await self.apos.doc.db.updateOne({ _id: householdId }, { $set: { title: name } });
        await self.apos.churchAudit.record(req, 'update', household, [ {
          field: 'title',
          old: household.title,
          new: name
        } ]);
      }
    };
  }
};
