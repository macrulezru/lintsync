import { describe, expect, it } from 'vitest'
import { pluralize } from '../../format/pluralize.js'

describe('pluralize', () => {
  it('picks the singular form for 1', () => {
    expect(pluralize(1, 'key', 'keys')).toBe('key')
  })

  it('picks the plural form for 0 and anything greater than 1', () => {
    expect(pluralize(0, 'key', 'keys')).toBe('keys')
    expect(pluralize(2, 'key', 'keys')).toBe('keys')
    expect(pluralize(21, 'key', 'keys')).toBe('keys')
  })
})
