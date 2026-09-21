import type { Preset } from './types.js'

/**
 * Preset for library-style npm packages (spec 11.2) — the author's 16+ published packages,
 * UI/CSS-free. No stylelint (no CSS to lint); stricter unused-code rules than vue-app since
 * mistakes in a published library are more expensive than in an application.
 */
const npmLibPreset: Preset = {
  name: 'npm-lib',
  version: '0.1.0',
  tools: {
    eslint: {
      configFormat: 'flat',
      // .mjs so the file is unambiguously ESM regardless of the target's package.json "type"
      // field (see vue-app.ts for the reasoning — verified against a real `eslint .` run).
      configFileName: 'eslint.config.mjs',
      dependencies: ['eslint', 'typescript-eslint'],
      baseExtends: [
        {
          importPath: 'typescript-eslint',
          importName: 'tseslint',
          expression: 'tseslint.configs.recommended',
        },
      ],
      rules: {
        'no-console': 'error',
        'no-debugger': 'error',
        '@typescript-eslint/no-unused-vars': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/explicit-module-boundary-types': 'warn',
      },
      managedKeys: ['rules.*'],
    },

    prettier: {
      configFormat: 'json',
      configFileName: '.prettierrc.json',
      dependencies: ['prettier'],
      rules: {
        semi: false,
        singleQuote: true,
        trailingComma: 'all',
        printWidth: 100,
        tabWidth: 2,
      },
      managedKeys: ['*'],
    },

    // stylelint is intentionally absent — init for npm-lib never offers to install it (spec
    // 11.2); a package that does have CSS uses `lintsync init stylelint --preset=vue-app`.
  },
}

export default npmLibPreset
