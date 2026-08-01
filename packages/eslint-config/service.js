import base from './index.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../**/services/*', '../../services/*'],
              message: 'Services must not import other services directly. Use events or HTTP contracts.',
            },
          ],
        },
      ],
    },
  },
];
