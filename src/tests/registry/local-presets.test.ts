import { describe, expect, it } from 'vitest'
import {
  addLocalPreset,
  listLocalPresets,
  parseLocalPresets,
  removeLocalPreset,
  serializeLocalPresets,
} from '../../registry/local-presets.js'
import type { LocalPresetsFile } from '../../registry/types.js'

const stub: LocalPresetsFile['presets'][number] = {
  name: 'my-team',
  version: '0.1.0',
  tools: {},
}

describe('local presets serialize/parse', () => {
  it('round-trips through serialize/parse', () => {
    const file: LocalPresetsFile = { presets: [stub] }
    expect(parseLocalPresets(serializeLocalPresets(file))).toEqual(file)
  })

  it('serializes with a trailing newline', () => {
    expect(serializeLocalPresets({ presets: [] }).endsWith('\n')).toBe(true)
  })
})

describe('addLocalPreset', () => {
  it('adds a new preset', () => {
    const result = addLocalPreset({ presets: [] }, stub)
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.presets).toEqual([stub])
    }
  })

  it('rejects a duplicate name among existing local presets', () => {
    const file: LocalPresetsFile = { presets: [stub] }
    const result = addLocalPreset(file, { ...stub, version: '9.9.9' })
    expect(result).toEqual({ error: 'A local preset named "my-team" already exists' })
  })

  it('rejects a name reserved by a built-in preset', () => {
    const result = addLocalPreset({ presets: [] }, { ...stub, name: 'base' }, ['vue-app', 'base'])
    expect(result).toEqual({ error: '"base" is a built-in preset name and can\'t be reused' })
  })
})

describe('removeLocalPreset', () => {
  it('removes an existing preset by name', () => {
    const file: LocalPresetsFile = { presets: [stub, { ...stub, name: 'other' }] }
    const result = removeLocalPreset(file, 'my-team')
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.presets.map((p) => p.name)).toEqual(['other'])
    }
  })

  it('rejects removing an unknown preset', () => {
    const result = removeLocalPreset({ presets: [] }, 'nope')
    expect(result).toEqual({ error: 'Local preset "nope" does not exist' })
  })
})

describe('listLocalPresets', () => {
  it('lists every stored preset', () => {
    const file: LocalPresetsFile = { presets: [stub, { ...stub, name: 'other' }] }
    expect(listLocalPresets(file).map((p) => p.name)).toEqual(['my-team', 'other'])
  })
})
