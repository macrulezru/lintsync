import { describe, expect, it } from 'vitest'
import { createPresetRegistry } from '../../presets/composite-registry.js'
import { builtinPresetNames } from '../../presets/registry.js'
import type { Preset } from '../../presets/types.js'

describe('createPresetRegistry', () => {
  it('resolves built-in presets even with no local presets', () => {
    const registry = createPresetRegistry([])
    expect(registry.getPreset('base')).toBeDefined()
    expect(registry.getPreset('vue-app')).toBeDefined()
  })

  it('resolves a local preset by name', () => {
    const myTeam: Preset = { name: 'my-team', version: '0.1.0', tools: {} }
    const registry = createPresetRegistry([myTeam])
    expect(registry.getPreset('my-team')).toEqual(myTeam)
  })

  it('returns undefined for a name in neither store', () => {
    const registry = createPresetRegistry([])
    expect(registry.getPreset('does-not-exist')).toBeUndefined()
  })

  it('lets a built-in preset win over a same-named local one', () => {
    const shadow: Preset = { name: 'base', version: '9.9.9', tools: {} }
    const registry = createPresetRegistry([shadow])
    expect(registry.getPreset('base')?.version).not.toBe('9.9.9')
  })

  it('exports the actual set of built-in names for reserved-name checks', () => {
    expect(builtinPresetNames.sort()).toEqual(['base', 'npm-lib', 'vue-app'])
  })
})
