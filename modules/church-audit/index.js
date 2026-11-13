// The audit trail (LGC-39): every create, change and delete of a church record
// is written to its own collection, `churchAudit`, with who, when, which
// record and field, and the old and new values. It is never edited, and only
// office admins can read it. Deleting a record writes an entry too.
//
// It lives outside the document collection on purpose: nothing in the editing
// screens can reach it, and a record's own permissions can't loosen it.
const rules = require('../../lib/rules.js');

const PERSON_LINKS = [ 'personIds', 'personAIds', 'personBIds' ];

// Every person a record is about, so a forget request can find it.
function relatedPeople(doc) {
  const ids = new Set();
  if (doc.type === 'person') {
    ids.add(doc._id);
  }
  for (const key of PERSON_LINKS) {
    for (const id of doc[key] || []) {
      ids.add(id);
    }
  }
  return [ ...ids ];
}

module.exports = {
  options: {
    alias: 'churchAudit',
    // The record types that are audited.
    types: [
      'person', 'household', 'person-relationship', 'group', 'office-note', 'away-date'
    ]
  },
  init(self) {
    self.collection = self.apos.db.collection('churchAudit');
    self.pending = new WeakMap();
  },
  handlers(self) {
    return {
      'apostrophe:modulesRegistered': {
        async createIndexes() {
          await self.collection.createIndex({ at: -1 });
          await self.collection.createIndex({
            recordId: 1,
            at: -1
          });
          await self.collection.createIndex({ personIds: 1 });
        }
      },
      '@apostrophecms/doc-type:beforeSave': {
        async snapshotBefore(req, doc) {
          if (!self.options.types.includes(doc.type)) {
            return;
          }
          const before = await self.apos.doc.db.findOne({ _id: doc._id });
          self.pending.set(doc, before);
        }
      },
      '@apostrophecms/doc-type:afterSave': {
        async recordChange(req, doc) {
          if (!self.options.types.includes(doc.type)) {
            return;
          }
          const before = self.pending.get(doc) || null;
          self.pending.delete(doc);
          const changes = rules.diffFields(rules.storedFields(before), rules.storedFields(doc), rules.BOOKKEEPING);
          if (before && !changes.length) {
            return;
          }
          await self.record(req, before ? 'update' : 'create', doc, changes);
        }
      },
      '@apostrophecms/doc-type:beforeDelete': {
        async snapshotDeleted(req, doc) {
          if (!self.options.types.includes(doc.type)) {
            return;
          }
          const before = await self.apos.doc.db.findOne({ _id: doc._id });
          self.pending.set(doc, before || doc);
        }
      },
      '@apostrophecms/doc-type:afterDelete': {
        async recordDelete(req, doc) {
          if (!self.options.types.includes(doc.type)) {
            return;
          }
          const before = self.pending.get(doc) || doc;
          self.pending.delete(doc);
          await self.record(req, 'delete', doc, rules.diffFields(rules.storedFields(before), null, rules.BOOKKEEPING));
        }
      }
    };
  },
  methods(self) {
    return {
      // Writes one entry. Also used by code that changes a record directly,
      // such as the household's generated name.
      async record(req, action, doc, changes) {
        const user = req && req.user;
        await self.collection.insertOne({
          at: new Date(),
          action,
          recordType: doc.type,
          recordId: doc._id,
          recordTitle: doc.title || null,
          personIds: relatedPeople(doc),
          by: user
            ? {
              _id: user._id,
              username: user.username,
              title: user.title
            }
            : null,
          changes
        });
      },
      // Office admins only; the newest first. `recordId` narrows to one record.
      async list(req, { recordId, limit = 100 } = {}) {
        if (!self.apos.permission.isAdmin(req)) {
          throw self.apos.error('forbidden');
        }
        const criteria = recordId ? { recordId } : {};
        return self.collection
          .find(criteria)
          .sort({ at: -1 })
          .limit(Math.min(Number(limit) || 100, 500))
          .toArray();
      },
      // A request to be forgotten (data model, "Leaving, and deletion"): the
      // trail keeps who, when and which record, but the old and new values for
      // that person become "[deleted at request]". Returns how many entries.
      async forgetPerson(personId) {
        const entries = await self.collection.find({ personIds: personId }).toArray();
        for (const entry of entries) {
          const redacted = rules.redactEntry(entry);
          await self.collection.updateOne(
            { _id: entry._id },
            {
              $set: {
                changes: redacted.changes,
                recordTitle: null,
                redacted: true
              }
            }
          );
        }
        return entries.length;
      }
    };

  },
  apiRoutes(self) {
    return {
      get: {
        // GET /api/v1/church-audit/entries?recordId=...&limit=...
        async entries(req) {
          return {
            entries: await self.list(req, {
              recordId: self.apos.launder.id(req.query.recordId),
              limit: self.apos.launder.integer(req.query.limit, 100, 1, 500)
            })
          };
        }
      }
    };
  },
  tasks(self) {
    return {
      forget: {
        usage: 'Replace the audit trail\'s old and new values for one person with "[deleted at request]".\n\nnode app church-audit:forget --person=<id>',
        async task(argv) {
          const personId = argv.person;
          if (!personId || typeof personId !== 'string') {
            throw new Error('Give the person\'s id: --person=<id>');
          }
          const count = await self.forgetPerson(personId);
          // eslint-disable-next-line no-console
          console.log(`Redacted ${count} audit entries for ${personId}.`);
        }
      }
    };
  }
};
