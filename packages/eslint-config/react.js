import base from './index.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    rules: {
      'no-console': 'off',
    },
  },
];
