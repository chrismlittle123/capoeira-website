import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default tseslint.config(
  { ignores: ['dist/', '.astro/', 'node_modules/', 'public/', 'coverage/', '.stryker-tmp/', 'reports/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...astro.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
  {
    // Typed linting for the TypeScript sources, so the production template's
    // type-aware rules can run; [code.linting.eslint.rules] pins every one.
    files: ['**/*.ts'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-for-in-array': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-eval': 'error',
      // Size and complexity, loose enough to catch only the outliers
      complexity: ['error', { max: 15 }],
      'max-depth': ['error', { max: 4 }],
      'max-params': ['error', { max: 5 }],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
);
