import { describe, expect, it } from 'vitest'
import { jsAdapter } from '../../merge-engine/js-adapter.js'
import { jsonAdapter } from '../../merge-engine/json-adapter.js'
import { generateInitialConfig } from '../../presets/generate-config.js'
import npmLibPreset from '../../presets/npm-lib.js'
import vueAppPreset from '../../presets/vue-app.js'

describe('generateInitialConfig', () => {
  it('generates a real, adapter-manageable eslint.config.js for vue-app', () => {
    const toolDef = vueAppPreset.tools.eslint!
    const text = generateInitialConfig(vueAppPreset, toolDef)

    expect(text).toBe(`import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default [
  ...pluginVue.configs['flat/recommended'],
  ...tseslint.configs.recommended,
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

    expect(text).toBe(`import tseslint from 'typescript-eslint'

export default [
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
