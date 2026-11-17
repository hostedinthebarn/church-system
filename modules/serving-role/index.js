// A job someone can be down for on the servers roster (LGC-44): how many
// people it needs (slots), whether it is filled each Sunday or once for the
// month, and the serving group whose members are eligible for it. The office
// edits these; a new role (Wednesdays, a special service) needs no new code.
//
// `roleKey` is the role's stable name in saved rosters and in the bulletin
// (announcements, openingPrayer, songLeader, closingPrayer, greeters,
// communion). Keep it when renaming the role.
const KEY_RE = /^[a-z][A-Za-z0-9]*$/;

// The starting set, from today's List of Servers (poc-demo-data-and-roster).
const DEFAULT_ROLES = [
  { roleKey: 'communion', title: 'Lord\'s Supper', slots: 4, period: 'monthly', order: 10 },
  { roleKey: 'trays', title: 'Communion Trays', slots: 1, period: 'monthly', order: 20 },
  { roleKey: 'announcements', title: 'Announcements', slots: 1, period: 'weekly', order: 30 },
  { roleKey: 'openingPrayer', title: 'Opening Prayer', slots: 1, period: 'weekly', order: 40 },
  { roleKey: 'songLeader', title: 'Song Leader', slots: 1, period: 'weekly', order: 50 },
  { roleKey: 'closingPrayer', title: 'Closing Prayer', slots: 1, period: 'weekly', order: 60 },
  { roleKey: 'greeters', title: 'Greeters', slots: 2, period: 'weekly', order: 70 }
];

module.exports = {
  extend: '@apostrophecms/piece-type',
  options: {
    alias: 'servingRole',
    shortcut: 'G,K',
    label: 'Serving role',
    pluralLabel: 'Serving roles',
    localized: false,
    viewRole: 'admin',
    editRole: 'admin',
    publishRole: 'admin',
    searchable: false
  },
  fields: {
    add: {
      roleKey: {
        type: 'string',
        label: 'Short name',
        help: 'Letters and digits, starting with a lower-case letter, such as songLeader. Saved rosters use it, so keep it when you rename the role.',
        required: true
      },
      slots: {
        type: 'integer',
        label: 'People needed',
        min: 1,
        max: 20,
        def: 1,
        required: true
      },
      period: {
        type: 'select',
        label: 'Filled',
        def: 'weekly',
        required: true,
        choices: [
          {
            label: 'Every Sunday',
            value: 'weekly'
          },
          {
            label: 'Once for the whole month',
            value: 'monthly'
          }
        ]
      },
      order: {
        type: 'integer',
        label: 'Order on the roster',
        def: 100
      },
      _group: {
        type: 'relationship',
        label: 'Serving group (who is eligible)',
        withType: 'group',
        max: 1
      }
    },
    group: {
      basics: {
        label: 'Role',
        fields: [ 'title', 'roleKey', 'slots', 'period', 'order', '_group' ]
      }
    }
  },
  handlers(self) {
    return {
      beforeSave: {
        async validKey(req, doc) {
          if (!KEY_RE.test(doc.roleKey || '')) {
            throw self.apos.error('invalid', 'The short name must be letters and digits, starting with a lower-case letter.', { field: 'roleKey' });
          }
          const other = await self.apos.doc.db.findOne({
            type: self.name,
            roleKey: doc.roleKey,
            _id: { $ne: doc._id }
          });
          if (other) {
            throw self.apos.error('invalid', 'Another role already has that short name.', { field: 'roleKey' });
          }
        }
      }
    };
  },
  methods(self) {
    return {
      defaults() {
        return DEFAULT_ROLES;
      },
      // Makes the starting roles, and an empty serving group for each, where
      // they do not exist yet. Safe to run twice. Returns what it made.
      async ensureDefaults(req) {
        const made = [];
        for (const spec of DEFAULT_ROLES) {
          if (await self.apos.doc.db.findOne({
            type: self.name,
            roleKey: spec.roleKey
          })) {
            continue;
          }
          let group = await self.apos.doc.db.findOne({
            type: 'group',
            title: spec.title,
            groupType: 'serving'
          });
          if (!group) {
            group = await self.apos.group.insert(req, {
              ...self.apos.group.newInstance(),
              title: spec.title,
              groupType: 'serving'
            });
          }
          await self.insert(req, {
            ...self.newInstance(),
            ...spec,
            groupIds: [ group._id ]
          });
          made.push(spec.roleKey);
        }
        return made;
      }
    };
  },
  tasks(self) {
    return {
      seed: {
        usage: 'Make the starting serving roles (and an empty serving group for each) that do not exist yet.\n\nnode app serving-role:seed',
        async task() {
          const made = await self.ensureDefaults(self.apos.task.getReq());
          // eslint-disable-next-line no-console
          console.log(made.length ? `Made: ${made.join(', ')}.` : 'Nothing to make: every starting role exists.');
        }
      }
    };
  }
};
