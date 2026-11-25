// The office's admin bar (Gary, 2026-11-25). Our own screens own the directory,
// rosters, away dates and the bulletin, so Apostrophe's generic editors for
// them are hidden: they were a second, confusing way in (the bulletin's broken
// Publish, LGC-87). Pages, Events, Images and the settings stay. Names are
// module names: Apostrophe drops the ':manager' suffix when it stores an item. The setup
// types with no screen of our own sit together in one "Church setup" menu.
const HIDDEN = [
  '@apostrophecms/user',
  '@apostrophecms/image-tag',
  '@apostrophecms/file',
  '@apostrophecms/file-tag',
  'person',
  'household',
  'away-date',
  'roster'
];
const SETUP = [
  'group',
  'serving-role',
  'person-relationship',
  'office-note',
  'bulletin-standing'
];

module.exports = {
  options: {
    addGroups: [
      {
        label: 'Church setup',
        items: SETUP
      }
    ]
  },
  extendMethods(self) {
    return {
      orderItems(_super) {
        self.items = self.items.filter(item => !HIDDEN.includes(item.name));
        return _super();
      }
    };
  }
};
