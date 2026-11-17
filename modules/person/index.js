// A person known to the church, adult or minor. One household each. Whether
// someone is a minor is worked out from the date of birth, never stored.
// Inactive people (with a reason) stay in the database; deleting is for data
// entered in error. Office admins only for now: members reach people through
// their household, in the members-area tickets that follow this one.
const rules = require('../../lib/rules.js');

module.exports = {
  extend: '@apostrophecms/piece-type',
  options: {
    alias: 'person',
    label: 'Person',
    pluralLabel: 'People',
    localized: false,
    viewRole: 'admin',
    editRole: 'admin',
    publishRole: 'admin',
    searchable: false
  },
  fields: {
    add: {
      // Set from the names on every save; read-only in the editor.
      title: {
        type: 'string',
        label: 'Name',
        readOnly: true
      },
      firstName: {
        type: 'string',
        label: 'First name',
        required: true
      },
      lastName: {
        type: 'string',
        label: 'Last name',
        required: true
      },
      preferredName: {
        type: 'string',
        label: 'Preferred name'
      },
      dateOfBirth: {
        type: 'date',
        label: 'Date of birth',
        required: true
      },
      email: {
        type: 'email',
        label: 'Email',
        help: 'An email belongs to one person only.'
      },
      cellphone: {
        type: 'string',
        label: 'Cellphone'
      },
      hiddenFields: {
        type: 'checkboxes',
        label: 'Hidden from other members',
        choices: [
          {
            label: 'Email',
            value: 'email'
          },
          {
            label: 'Cellphone',
            value: 'cellphone'
          },
          {
            label: 'Address',
            value: 'address'
          }
        ]
      },
      status: {
        type: 'select',
        label: 'Status (office only)',
        def: 'member',
        choices: [
          {
            label: 'Member',
            value: 'member'
          },
          {
            label: 'Regular attender',
            value: 'regular'
          },
          {
            label: 'Visitor',
            value: 'visitor'
          }
        ]
      },
      inactiveReason: {
        type: 'select',
        label: 'Inactive',
        help: 'Leave blank for someone who is listed.',
        def: '',
        choices: [
          {
            label: 'Active',
            value: ''
          },
          {
            label: 'Deceased',
            value: 'deceased'
          },
          {
            label: 'Moved',
            value: 'moved'
          },
          {
            label: 'Left',
            value: 'left'
          }
        ]
      },
      baptismDate: {
        type: 'date',
        label: 'Baptism date'
      },
      officeAdmin: {
        type: 'boolean',
        label: 'Office admin',
        help: 'Signs in as an office admin, not a member. Needs an email and an adult.',
        def: false
      },
      showBaptism: {
        type: 'boolean',
        label: 'Show the baptism date to members',
        def: false
      },
      _household: {
        type: 'relationship',
        label: 'Household',
        withType: 'household',
        max: 1,
        required: true
      }
    },
    group: {
      basics: {
        label: 'Person',
        fields: [
          'firstName', 'lastName', 'preferredName', 'dateOfBirth', '_household',
          'email', 'cellphone', 'hiddenFields'
        ]
      },
      office: {
        label: 'Office',
        fields: [ 'status', 'inactiveReason', 'officeAdmin', 'baptismDate', 'showBaptism' ]
      }
    }
  },
  handlers(self) {
    return {
      beforeInsert: {
        setTitle(req, doc) {
          doc.title = `${doc.lastName}, ${doc.firstName}`;
        }
      },
      beforeUpdate: {
        setTitle(req, doc) {
          doc.title = `${doc.lastName}, ${doc.firstName}`;
        }
      },
      beforeSave: {
        async oneEmailOnePerson(req, doc) {
          doc.email = (doc.email || '').trim().toLowerCase();
          if (!doc.email) {
            return;
          }
          const other = await self.apos.doc.db.findOne({
            type: 'person',
            email: doc.email,
            _id: { $ne: doc._id }
          });
          if (other) {
            throw self.apos.error('invalid', 'That email already belongs to another person.', {
              field: 'email'
            });
          }
        }
      },
      afterSave: {
        async renameHousehold(req, doc) {
          await self.apos.household.refreshName(req, doc.householdIds && doc.householdIds[0]);
        }
      },
      afterDelete: {
        async renameHousehold(req, doc) {
          await self.apos.household.refreshName(req, doc.householdIds && doc.householdIds[0]);
        }
      }
    };
  },
  methods(self) {
    return {
      isMinor(person, today = rules.todayIso()) {
        return rules.isMinor(person.dateOfBirth, today);
      }
    };
  }
};
