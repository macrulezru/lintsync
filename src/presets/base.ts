import type { Preset } from './types.js'

/**
 * Generic, stack-agnostic preset — the "pick tools individually" path of interactive `init`
 * (not from spec section 11, which only names `vue-app`/`npm-lib`; this is this
 * implementation's own answer to "I don't want a curated stack preset, just reasonable
 * defaults"). Deliberately mild rather than opinionated: `eslint:recommended`-level strictness
 * via typescript-eslint's own recommended config, the same base stylistic decisions section 11
 * declares common to every preset, and stylelint-config-standard with no overrides — nothing
 * tied to Vue, a library-publishing workflow, or any other specific setup.
 */
const basePreset: Preset = {
  name: 'base',
  version: '0.1.0',
  tools: {
    eslint: {
      configFormat: 'flat',
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
        'no-console': 'warn',
        'no-debugger': 'error',
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

    stylelint: {
      configFormat: 'json',
      configFileName: '.stylelintrc.json',
      dependencies: ['stylelint', 'stylelint-config-standard'],
      extendsPackages: ['stylelint-config-standard'],
      rules: {},
      managedKeys: ['rules.*'],
    },
  },
}

export default basePreset
