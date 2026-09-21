import { describe, expect, it } from 'vitest'
import { toPresetSnapshot } from '../../presets/snapshot.js'
import type { Preset, PresetToolDefinition } from '../../presets/types.js'

const preset: Preset = { name: 'vue-app', version: '1.4.0', tools: {} }

describe('toPresetSnapshot', () => {
  it('nests rules under the managedKeys prefix (eslint/stylelint-style rules.*)', () => {
    const toolDef: PresetToolDefinition = {
      configFormat: 'flat',
      configFileName: 'eslint.config.js',
      dependencies: [],
      rules: { 'no-console': 'warn', 'no-debugger': 'error' },
      managedKeys: ['rules.*'],
    }

    const snapshot = toPresetSnapshot(preset, toolDef)

    expect(snapshot).toEqual({
      name: 'vue-app',
      version: '1.4.0',
      values: { rules: { 'no-console': 'warn', 'no-debugger': 'error' } },
      managedKeys: [['rules', '*']],
    })
  })

  it('places rules at the config root for a bare `*` (Prettier-style flat config)', () => {
    const toolDef: PresetToolDefinition = {
      configFormat: 'json',
      configFileName: '.prettierrc.json',
      dependencies: [],
      rules: { semi: false, singleQuote: true },
      managedKeys: ['*'],
    }

    const snapshot = toPresetSnapshot(preset, toolDef)

    expect(snapshot.values).toEqual({ semi: false, singleQuote: true })
    expect(snapshot.managedKeys).toEqual([['*']])
  })

  it('rejects a managedKeys pattern that does not end in a wildcard', () => {
    const toolDef: PresetToolDefinition = {
      configFormat: 'flat',
      configFileName: 'eslint.config.js',
      dependencies: [],
      rules: { 'no-console': 'warn' },
      managedKeys: ['rules.no-console'],
    }

    expect(() => toPresetSnapshot(preset, toolDef)).toThrow(/must end in a wildcard/)
  })
})
