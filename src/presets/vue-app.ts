import type { Preset } from './types.js'

/**
 * Preset for Vue/Nuxt applications (spec 11.1) — vuecraft.ru, macrulez.ru and similar. Built
 * from scratch, not derived from any of the author's existing project configs (spec section 11).
 */
const vueAppPreset: Preset = {
  name: 'vue-app',
  version: '0.1.0',
  tools: {
    eslint: {
      configFormat: 'flat',
      // .mjs, not .js: the generated file always uses `import`/`export default`, and we can't
      // assume the target project's package.json has "type": "module" — .mjs makes it
      // unambiguously ESM regardless (verified via a real `eslint .` run against a CJS-default
      // project; `.js` there still worked, but only after a "reparsing as ES module" warning).
      configFileName: 'eslint.config.mjs',
      dependencies: [
        'eslint',
        'typescript-eslint',
        'eslint-plugin-vue',
        '@vue/eslint-config-typescript',
      ],
      baseExtends: [
        {
          importPath: 'eslint-plugin-vue',
          importName: 'pluginVue',
          expression: "pluginVue.configs['flat/recommended']",
        },
        {
          importPath: 'typescript-eslint',
          importName: 'tseslint',
          expression: 'tseslint.configs.recommended',
        },
      ],
      rules: {
        'no-console': 'warn',
        'no-debugger': 'error',
        'vue/multi-word-component-names': 'off',
        'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
        'vue/component-name-in-template-casing': ['error', 'PascalCase'],
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'warn',
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
        vueIndentScriptAndStyle: false,
      },
      managedKeys: ['*'],
    },

    stylelint: {
      configFormat: 'json',
      configFileName: '.stylelintrc.json',
      dependencies: [
        'stylelint',
        'stylelint-config-standard-scss',
        'stylelint-config-recommended-vue',
      ],
      extendsPackages: ['stylelint-config-standard-scss', 'stylelint-config-recommended-vue'],
      rules: {
        'selector-class-pattern': null,
        'scss/at-rule-no-unknown': true,
        'no-empty-source': null,
      },
      managedKeys: ['rules.*'],
    },
  },
}

export default vueAppPreset
