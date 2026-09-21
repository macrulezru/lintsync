import { describe, expect, it } from 'vitest'
import { pluralizeRu } from '../../format/pluralize-ru.js'

describe('pluralizeRu', () => {
  it('picks the singular form for 1, 21, 101 (but not 11)', () => {
    expect(pluralizeRu(1, 'ключ', 'ключа', 'ключей')).toBe('ключ')
    expect(pluralizeRu(21, 'ключ', 'ключа', 'ключей')).toBe('ключ')
    expect(pluralizeRu(101, 'ключ', 'ключа', 'ключей')).toBe('ключ')
  })

  it('picks the few form for 2-4, 22-24 (but not 12-14)', () => {
    expect(pluralizeRu(2, 'ключ', 'ключа', 'ключей')).toBe('ключа')
    expect(pluralizeRu(4, 'ключ', 'ключа', 'ключей')).toBe('ключа')
    expect(pluralizeRu(22, 'ключ', 'ключа', 'ключей')).toBe('ключа')
  })

  it('picks the many form for 0, 5-20, 11-14, 25', () => {
    expect(pluralizeRu(0, 'ключ', 'ключа', 'ключей')).toBe('ключей')
    expect(pluralizeRu(5, 'ключ', 'ключа', 'ключей')).toBe('ключей')
    expect(pluralizeRu(11, 'ключ', 'ключа', 'ключей')).toBe('ключей')
    expect(pluralizeRu(14, 'ключ', 'ключа', 'ключей')).toBe('ключей')
    expect(pluralizeRu(25, 'ключ', 'ключа', 'ключей')).toBe('ключей')
  })
})
