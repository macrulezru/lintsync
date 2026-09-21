import { describe, expect, it } from 'vitest'
import { parseMainConfig } from '../../config/main-config.js'

describe('parseMainConfig', () => {
  it('parses a config with both fields set', () => {
    expect(parseMainConfig('{"presetsPath": "a", "registryPath": "b"}')).toEqual({
      presetsPath: 'a',
      registryPath: 'b',
    })
  })

  it('parses an empty object (no overrides)', () => {
    expect(parseMainConfig('{}')).toEqual({})
  })

  it('throws on invalid JSON, leaving the "missing/unreadable" fallback to the caller', () => {
    expect(() => parseMainConfig('not json')).toThrow()
  })
})
