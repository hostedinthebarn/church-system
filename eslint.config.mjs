import apostrophe from 'eslint-config-apostrophe';

export default [
  ...apostrophe,
  { ignores: [ 'packages/*/node_modules/**' ] }
];
