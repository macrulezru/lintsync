import { describe, expect, it } from 'vitest'
import { builtinPresets } from '../../presets/registry.js'

describe('builtinPresets', () => {
  it('registers vue-app with eslint, prettier and stylelint', () => {
    const preset = builtinPresets.getPreset('vue-app')
    expect(preset).toBeDefined()
    expect(preset?.version).toBe('0.1.0')
    expect(Object.keys(preset?.tools ?? {}).sort()).toEqual(['eslint', 'prettier', 'stylelint'])
  })

  it('registers npm-lib with eslint and prettier only (no stylelint, spec 11.2)', () => {
    const preset = builtinPresets.getPreset('npm-lib')
    expect(preset).toBeDefined()
    expect(Object.keys(preset?.tools ?? {}).sort()).toEqual(['eslint', 'prettier'])
  })

  it('registers base with all 3 tools and generic, mild rules', () => {
    const preset = builtinPresets.getPreset('base')
    expect(preset).toBeDefined()
    expect(Object.keys(preset?.tools ?? {}).sort()).toEqual(['eslint', 'prettier', 'stylelint'])
    // deliberately milder than npm-lib's opinionated no-console: 'error'
    expect(preset?.tools.eslint?.rules).toMatchObject({ 'no-console': 'warn' })
  })

  it('returns undefined for an unknown preset name', () => {
    expect(builtinPresets.getPreset('does-not-exist')).toBeUndefined()
  })

  it("vue-app's eslint managedKeys parse and its rules produce a valid PresetSnapshot", async () => {
    const { toPresetSnapshot } = await import('../../presets/snapshot.js')
    const preset = builtinPresets.getPreset('vue-app')
    const toolDef = preset?.tools.eslint
    expect(toolDef).toBeDefined()
    if (!toolDef) return
    const snapshot = toPresetSnapshot(preset!, toolDef)
    expect(snapshot.values).toEqual({ rules: toolDef.rules })
  })
})
