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
      // Not @vue/eslint-config-typescript: its `withVueTs()` helper returns a Promise (async
      // config composition via eslint-flat-config-utils) rather than a plain spreadable array,
      // which our array-export codegen/adapter model can't represent. Verified with a real
      // `eslint` run that the plain array-based fix below (matching vue-eslint-parser's own
      // documented manual TypeScript setup) parses <script setup lang="ts"> generics and
      // type-only syntax just as correctly, without needing that dependency at all.
      dependencies: [
        'eslint',
        'typescript-eslint',
        'eslint-plugin-vue',
        '@eslint/js',
        'vue-eslint-parser',
      ],
      baseExtends: [
        // See base.ts for why this is needed.
        {
          importPath: '@eslint/js',
          importName: 'js',
          expression: '[js.configs.recommended]',
        },
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
        // Without this, `<script setup lang="ts">` generics (e.g. `defineProps<Props>()`) fail
        // to parse at all — verified with a real `eslint` run: vue-eslint-parser only parses the
        // <script> block with TypeScript's own parser when explicitly told to (its own README's
        // documented manual setup, reusing typescript-eslint's own `.parser` rather than a
        // separate `@typescript-eslint/parser` import). `no-undef` is turned off for the same
        // reason typescript-eslint's own `eslint-recommended` turns it off for .ts/.tsx: that
        // config's file-matching doesn't cover .vue, so without this, real browser/Node globals
        // (console, window, ...) would falsely trip `no-undef` inside .vue components.
        {
          importPath: 'vue-eslint-parser',
          importName: 'vueParser',
          expression:
            "[{ files: ['**/*.vue'], languageOptions: { parser: vueParser, parserOptions: { parser: tseslint.parser } }, rules: { 'no-undef': 'off' } }]",
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
