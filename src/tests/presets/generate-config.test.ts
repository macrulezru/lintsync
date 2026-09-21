import { describe, expect, it } from 'vitest'
import { jsAdapter } from '../../merge-engine/js-adapter.js'
import { jsonAdapter } from '../../merge-engine/json-adapter.js'
import { generateInitialConfig } from '../../presets/generate-config.js'
import npmLibPreset from '../../presets/npm-lib.js'
import reactAppPreset from '../../presets/react-app.js'
import type { FlatJsPresetToolDefinition } from '../../presets/types.js'
import vueAppPreset from '../../presets/vue-app.js'

describe('generateInitialConfig', () => {
  it('generates a real, adapter-manageable eslint.config.js for vue-app', () => {
    const toolDef = vueAppPreset.tools.eslint!
    const text = generateInitialConfig(vueAppPreset, toolDef)

    expect(text).toBe(`import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

export default [
  ...[js.configs.recommended],
  ...pluginVue.configs['flat/recommended'],
  ...tseslint.configs.recommended,
  ...[{ files: ['**/*.vue'], languageOptions: { parser: vueParser, parserOptions: { parser: tseslint.parser } }, rules: { 'no-undef': 'off' } }],
  {
    rules: {
      'no-console': 'warn',
      'no-debugger': 'error',
      'vue/multi-word-component-names': 'off',
      'vue/block-order': ['error', { order: ['script', 'template', 'style'] }],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]
`)

    // The js-adapter must be able to read every managed rule straight back out of this text —
    // proof it's not just plausible-looking source, but something sync can actually manage.
    const handle = jsAdapter.parse(text)
    for (const [rule, value] of Object.entries(toolDef.rules as Record<string, unknown>)) {
      expect(jsAdapter.getValueAt(handle, ['rules', rule])).toEqual(value)
    }
  })

  it('generates a real eslint.config.js for npm-lib with a single baseExtend and no vue plugin', () => {
    const toolDef = npmLibPreset.tools.eslint!
    const text = generateInitialConfig(npmLibPreset, toolDef)

    expect(text).toBe(`import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  ...[js.configs.recommended],
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': 'error',
      'no-debugger': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
    },
  },
]
`)
    expect(text).not.toContain('eslint-plugin-vue')
  })

  it('generates a real, adapter-manageable eslint.config.js for react-app, including a no-import glue entry', () => {
    const toolDef = reactAppPreset.tools.eslint!
    const text = generateInitialConfig(reactAppPreset, toolDef)

    expect(text).toBe(`import js from '@eslint/js'
import pluginReact from 'eslint-plugin-react'
import pluginReactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default [
  ...[js.configs.recommended],
  ...[pluginReact.configs.flat.recommended],
  ...[pluginReactHooks.configs.flat.recommended],
  ...tseslint.configs.recommended,
  ...[{ settings: { react: { version: 'detect' } } }],
  {
    rules: {
      'no-console': 'warn',
      'no-debugger': 'error',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]
`)

    // No import line for the settings-only baseExtend entry, which declares neither importPath
    // nor importName (see types.ts) — proof the "no import needed" path actually skips it rather
    // than emitting `import undefined from 'undefined'`.
    expect(text).not.toContain('undefined')

    const handle = jsAdapter.parse(text)
    for (const [rule, value] of Object.entries(toolDef.rules as Record<string, unknown>)) {
      expect(jsAdapter.getValueAt(handle, ['rules', rule])).toEqual(value)
    }
  })

  it('omits an import line for a baseExtend entry with no importPath/importName', () => {
    const toolDef: FlatJsPresetToolDefinition = {
      configFormat: 'flat',
      configFileName: 'eslint.config.mjs',
      dependencies: [],
      baseExtends: [{ expression: "[{ settings: { foo: 'bar' } }]" }],
      rules: {},
      managedKeys: ['rules.*'],
    }
    const text = generateInitialConfig({ name: 'x', version: '0', tools: {} }, toolDef)
    expect(text).toContain("...[{ settings: { foo: 'bar' } }],")
    expect(text).not.toContain('undefined')
  })

  it('generates a Prettier .prettierrc.json matching what toPresetSnapshot expects to read back', () => {
    const toolDef = vueAppPreset.tools.prettier!
    const text = generateInitialConfig(vueAppPreset, toolDef)

    expect(JSON.parse(text)).toEqual(toolDef.rules)

    const handle = jsonAdapter.parse(text)
    expect(jsonAdapter.getValueAt(handle, ['semi'])).toBe(false)
    expect(jsonAdapter.getValueAt(handle, ['singleQuote'])).toBe(true)
  })

  it("generates a Stylelint .stylelintrc.json with 'extends' first, then 'rules'", () => {
    const toolDef = vueAppPreset.tools.stylelint!
    const text = generateInitialConfig(vueAppPreset, toolDef)

    expect(text).toBe(`{
  "extends": [
    "stylelint-config-standard-scss",
    "stylelint-config-recommended-vue"
  ],
  "rules": {
    "selector-class-pattern": null,
    "scss/at-rule-no-unknown": true,
    "no-empty-source": null
  }
}
`)

    const handle = jsonAdapter.parse(text)
    expect(jsonAdapter.getValueAt(handle, ['rules', 'scss/at-rule-no-unknown'])).toBe(true)
  })

  it('omits "extends" entirely for npm-lib prettier, which has no extendsPackages', () => {
    const toolDef = npmLibPreset.tools.prettier!
    const text = generateInitialConfig(npmLibPreset, toolDef)
    expect(JSON.parse(text)).not.toHaveProperty('extends')
    expect(JSON.parse(text)).toEqual(toolDef.rules)
  })
})
