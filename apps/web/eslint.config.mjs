// Code quality for the app's own code, with the rules coreloom-ui applies to its starter.
// Files installed from the coreloom-ui registry (components, hooks, lib) are linted upstream and
// left as installed, so they are ignored here. Formatting is Prettier's job: eslint-config-prettier
// (last) turns off every rule that would fight it.
import js from '@eslint/js'
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs'
import eslintReact from '@eslint-react/eslint-plugin'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  globalIgnores([
    'dist/',
    'public/',
    'docker/',
    'src/routeTree.gen.ts',
    // Installed from the coreloom-ui registry (`shadcn add @coreloom/...`).
    'src/components/**/*',
    '!src/components/brand.tsx',
    '!src/components/router-link.tsx',
    'src/hooks/',
    'src/styles/coreloom/',
    'src/lib/uml*.ts',
    'src/lib/ai.ts',
    'src/lib/i18n.tsx',
    'src/lib/icon.tsx',
    'src/lib/initials.ts',
    'src/lib/link.tsx',
    'src/lib/utils.ts',
  ]),
  js.configs.recommended,
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  {
    extends: [comments.recommended],
    rules: {
      '@eslint-community/eslint-comments/require-description': [
        'error',
        { ignore: ['eslint-enable'] },
      ],
    },
  },
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.tsx', '**/*.ts'],
    extends: [
      reactHooks.configs.flat.recommended,
      eslintReact.configs['recommended-type-checked'],
      jsxA11y.flatConfigs.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      // react-hooks reports the React Compiler rules; @eslint-react's copies stay off.
      '@eslint-react/error-boundaries': 'off',
      '@eslint-react/exhaustive-deps': 'off',
      '@eslint-react/globals': 'off',
      '@eslint-react/immutability': 'off',
      '@eslint-react/purity': 'off',
      '@eslint-react/refs': 'off',
      '@eslint-react/rules-of-hooks': 'off',
      '@eslint-react/set-state-in-effect': 'off',
      '@eslint-react/set-state-in-render': 'off',
      '@eslint-react/static-components': 'off',
      '@eslint-react/unsupported-syntax': 'off',
      '@eslint-react/use-memo': 'off',
      '@eslint-react/naming-convention-ref-name': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  {
    languageOptions: { globals: globals.browser },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // TanStack Router: a route file exports `Route` next to its page components, and
    // `throw redirect()` / `throw notFound()` is how loaders leave.
    files: ['src/routes/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/only-throw-error': [
        'error',
        {
          allow: [
            {
              from: 'package',
              package: '@tanstack/router-core',
              name: ['Redirect', 'NotFoundError'],
            },
          ],
        },
      ],
    },
  },
  {
    // Providers next to their hooks (useAuth, useLocale): Fast Refresh only, off here.
    files: ['src/auth/**/*.tsx', 'src/lib/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Size limits, as in coreloom-ui (AGENTS.md → How to change code).
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      complexity: ['error', 15],
      'max-lines-per-function': ['error', { max: 150, skipBlankLines: true, skipComments: true }],
      'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', 4],
      'max-params': ['error', 4],
      'no-nested-ternary': 'error',
    },
  },
  {
    // The app's copy is one long table of strings per locale.
    files: ['src/messages.ts'],
    rules: { 'max-lines': 'off' },
  },
  {
    files: ['*.{mjs,ts}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
)
