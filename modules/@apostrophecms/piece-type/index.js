// Every piece type: a REST insert takes the schema default for any field the
// caller left out, as the admin screens do (LGC-92). Apostrophe's convert
// launders a missing boolean to false and a missing select to null, so an
// event POSTed with only a title and date came out members-only, with no
// status. The planned MCP server (and any script) sends only what it means
// to set, so this has to hold for every caller, not be a rule they remember.
module.exports = {
  extendMethods(self) {
    return {
      async convertInsertAndRefresh(_super, req, input, options) {
        const defaults = self.newInstance();
        const filled = { ...(input || {}) };
        for (const field of self.schema) {
          if (field.def !== undefined && !Object.prototype.hasOwnProperty.call(filled, field.name)) {
            filled[field.name] = defaults[field.name];
          }
        }
        return _super(req, filled, options);
      }
    };
  }
};
