import apostrophe from 'eslint-config-apostrophe';

export default [
  ...apostrophe,
  {
    ignores: [
      // Logic packages carry their own style and their own tests (100% coverage)
      'packages/**',
      // Static HTML mockups kept for reference (LGC-33, LGC-46), not app code
      'reference/**'
    ]
  }
];
