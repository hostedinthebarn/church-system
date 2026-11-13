// An entry in the office's add-only stream about one person or a whole
// household. A saved note can't be edited or deleted: a mistake is fixed with
// a follow-up note, or by striking the note through. Notes can be ticked as a
// contact (a call, a visit, a card) with a date. Office admins only, for
// reading and writing; never shown to the person, the PDF or the bulletin.
const rules = require('../../lib/rules.js');

module.exports = {
  extend: '@apostrophecms/piece-type',
  options: {
    alias: 'officeNote',
    label: 'Office note',
    pluralLabel: 'Office notes',
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
      text: {
        type: 'string',
        label: 'Note',
        textarea: true,
        required: true
      },
      _person: {
        type: 'relationship',
        label: 'About this person',
        withType: 'person',
        max: 1
      },
      _household: {
        type: 'relationship',
        label: 'About this household',
        withType: 'household',
        max: 1
      },
      contacted: {
        type: 'boolean',
        label: 'This was a contact (a call, a visit, a card)',
        def: false
      },
      contactDate: {
        type: 'date',
        label: 'Contact date',
        if: { contacted: true },
        required: true
      },
      struck: {
        type: 'boolean',
        label: 'Struck through (a mistake)',
        def: false
      },
      authorName: {
        type: 'string',
        label: 'Written by',
        readOnly: true
      }
    }
  },
  handlers(self) {
    return {
      beforeInsert: {
        stamp(req, doc) {
          doc.authorName = (req.user && req.user.title) || 'system';
          doc.authorId = (req.user && req.user._id) || null;
          doc.title = `${new Date().toISOString().slice(0, 10)} ${doc.authorName}`;
          doc.struck = false;
        }
      },
      beforeUpdate: {
        async addOnly(req, doc) {
          const before = await self.apos.doc.db.findOne({ _id: doc._id });
          if (before && !rules.noteChangeAllowed(rules.storedFields(before), rules.storedFields(doc))) {
            throw self.apos.error('forbidden', 'Office notes can only be added to. Write a follow-up note, or strike this one through.');
          }
        }
      },
      beforeSave: {
        aboutSomeone(req, doc) {
          const hasPerson = (doc.personIds || []).length > 0;
          const hasHousehold = (doc.householdIds || []).length > 0;
          if (hasPerson === hasHousehold) {
            throw self.apos.error('invalid', 'A note is about one person or one household.');
          }
        }
      },
      beforeDelete: {
        refuse() {
          throw self.apos.error('forbidden', 'Office notes are never deleted. Strike the note through instead.');
        }
      }
    };
  }
};
