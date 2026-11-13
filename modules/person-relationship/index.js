// A stored link between two people: spouse, parent and child, or guardian.
// It can cross households. Siblings, grandparents and grandchildren are worked
// out from these, never stored. The wedding date (the anniversary) belongs to
// a spouse link. For parent/child and guardian the first person is the parent
// or guardian and the second is the child or ward.
module.exports = {
  extend: '@apostrophecms/piece-type',
  options: {
    alias: 'personRelationship',
    label: 'Relationship',
    pluralLabel: 'Relationships',
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
      kind: {
        type: 'select',
        label: 'Kind',
        required: true,
        choices: [
          {
            label: 'Spouse',
            value: 'spouse'
          },
          {
            label: 'Parent and child (first person is the parent)',
            value: 'parent-child'
          },
          {
            label: 'Guardian (first person is the guardian)',
            value: 'guardian'
          }
        ]
      },
      _personA: {
        type: 'relationship',
        label: 'First person',
        withType: 'person',
        max: 1,
        required: true
      },
      _personB: {
        type: 'relationship',
        label: 'Second person',
        withType: 'person',
        max: 1,
        required: true
      },
      anniversary: {
        type: 'date',
        label: 'Wedding date',
        if: { kind: 'spouse' }
      }
    }
  },
  handlers(self) {
    // Title and checks run before Apostrophe makes the slug from the title.
    const check = async (req, doc) => {
      const a = (doc.personAIds || [])[0];
      const b = (doc.personBIds || [])[0];
      if (a && a === b) {
        throw self.apos.error('invalid', 'A person can\'t be related to themself.');
      }
      if (doc.kind !== 'spouse') {
        doc.anniversary = null;
      }
      const names = [];
      for (const id of [ a, b ]) {
        const person = id && await self.apos.doc.db.findOne({ _id: id });
        names.push(person ? person.title : '?');
      }
      doc.title = `${names[0]} / ${names[1]} (${doc.kind})`;
    };
    return {
      beforeInsert: { check },
      beforeUpdate: { check }
    };
  }
};
