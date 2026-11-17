// The bulletin's set-once blocks (LGC-61): leadership, servant leaders, the
// coffee box, missions, benevolence and the "who to call" footer. One record
// the office edits when something changes; every week's bulletin reads it.
// Contact details and service times are left blank to fall back to the
// church's published ones. Plain text: blank line between paragraphs, a line
// starting "- " is a list item.
const { SECTIONS, standingIds } = require('@church-system/bulletin-logic');

const fields = Object.fromEntries(standingIds().map(id => [ id, {
  type: 'string',
  label: SECTIONS.find(section => section.id === id).title,
  textarea: true
} ]));

module.exports = {
  extend: '@apostrophecms/piece-type',
  options: {
    alias: 'bulletinStanding',
    shortcut: 'G,V',
    label: 'Bulletin standing content',
    pluralLabel: 'Bulletin standing content',
    localized: false,
    viewRole: 'admin',
    editRole: 'admin',
    publishRole: 'admin',
    searchable: false
  },
  fields: {
    add: fields,
    group: {
      basics: {
        label: 'Standing content',
        fields: [ 'title', ...Object.keys(fields) ]
      }
    }
  },
  handlers(self) {
    return {
      beforeInsert: {
        async onlyOne(req, doc) {
          doc.title = 'Bulletin standing content';
          if (await self.apos.doc.db.findOne({ type: self.name })) {
            throw self.apos.error('invalid', 'There is one set of standing content. Edit it instead of adding another.');
          }
        }
      },
      beforeDelete: {
        refuse() {
          throw self.apos.error('forbidden', 'The standing content is never deleted. Clear the fields instead.');
        }
      }
    };
  },
  methods(self) {
    return {
      // Plain { sectionId: text }, or {} when none has been saved yet.
      async current(req) {
        const doc = await self.find(req).sort({ createdAt: 1 }).toObject();
        return Object.fromEntries(standingIds().map(id => [ id, (doc && doc[id]) || '' ]));
      }
    };
  }
};
