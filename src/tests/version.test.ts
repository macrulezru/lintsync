import { describe, expect, it } from 'vitest'
import { getVersion } from '../version.js'

describe('getVersion', () => {
  it('reads the version from package.json', () => {
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/)
  })
})
