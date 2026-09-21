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
      dependencies: ['eslint', 'typescript-eslint', '@eslint/js'],
      baseExtends: [
        // See base.ts for why this is needed: typescript-eslint's own `recommended` config only
        // *disables* a subset of eslint:recommended's rules (assuming it's already applied), it
        // doesn't replace it — real correctness rules with no TS-specific overlap were silently
        // never enabled without this.
        {
          importPath: '@eslint/js',
          importName: 'js',
          expression: '[js.configs.recommended]',
        },
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
