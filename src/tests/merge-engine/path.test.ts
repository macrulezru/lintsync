import { describe, expect, it } from 'vitest'
import {
  formatPathExpression,
  matchesPattern,
  parsePathExpression,
  PathParseError,
} from '../../merge-engine/path.js'

describe('parsePathExpression', () => {
  it('parses a simple dot path', () => {
    expect(parsePathExpression('rules.no-console')).toEqual(['rules', 'no-console'])
  })

  it('parses a single bare segment', () => {
    expect(parsePathExpression('printWidth')).toEqual(['printWidth'])
  })

  it('parses a bracket segment containing a slash', () => {
    expect(parsePathExpression('rules["vue/multi-word-component-names"]')).toEqual([
      'rules',
      'vue/multi-word-component-names',
    ])
  })

  it('parses a bracket segment containing @ and slash', () => {
    expect(parsePathExpression('rules["@typescript-eslint/no-unused-vars"]')).toEqual([
      'rules',
      '@typescript-eslint/no-unused-vars',
    ])
  })

  it('supports single quotes inside brackets', () => {
    expect(parsePathExpression("rules['no-console']")).toEqual(['rules', 'no-console'])
  })

  it('parses a wildcard segment', () => {
    expect(parsePathExpression('rules.*')).toEqual(['rules', '*'])
  })

  it('parses a bare top-level wildcard', () => {
    expect(parsePathExpression('*')).toEqual(['*'])
  })

  it('mixes dot and bracket segments', () => {
    expect(parsePathExpression('a.b["c/d"].e')).toEqual(['a', 'b', 'c/d', 'e'])
  })

  it('parses consecutive bracket segments without a dot between them', () => {
    expect(parsePathExpression('rules["a"]["b"]')).toEqual(['rules', 'a', 'b'])
  })

  it('handles bracket-like characters inside a quoted segment (nested brackets)', () => {
    expect(parsePathExpression('rules["weird[key]"]')).toEqual(['rules', 'weird[key]'])
  })

  it('handles an empty-string segment via brackets', () => {
    expect(parsePathExpression('rules[""]')).toEqual(['rules', ''])
  })

  it('rejects an empty path expression', () => {
    expect(() => parsePathExpression('')).toThrow(PathParseError)
  })

  it('rejects a path starting with a dot', () => {
    expect(() => parsePathExpression('.rules')).toThrow(PathParseError)
  })

  it('rejects a trailing dot with nothing after it', () => {
    expect(() => parsePathExpression('rules.')).toThrow(PathParseError)
  })

  it('rejects a double dot', () => {
    expect(() => parsePathExpression('rules..no-console')).toThrow(PathParseError)
  })

  it('rejects an unterminated bracket', () => {
    expect(() => parsePathExpression('rules["no-console"')).toThrow(PathParseError)
  })

  it('rejects a bracket missing a closing quote', () => {
    expect(() => parsePathExpression('rules[no-console]')).toThrow(PathParseError)
  })

  it('rejects a stray closing bracket', () => {
    expect(() => parsePathExpression('rules]')).toThrow(PathParseError)
  })

  it('rejects a dot immediately followed by a bracket', () => {
    expect(() => parsePathExpression('rules.["no-console"]')).toThrow(PathParseError)
  })
})

describe('formatPathExpression', () => {
  it('round-trips a simple dot path', () => {
    const path = parsePathExpression('rules.no-console')
    expect(formatPathExpression(path)).toBe('rules.no-console')
  })

  it('uses the bare dot form for a slash-only segment (no dot inside, unambiguous)', () => {
    expect(formatPathExpression(['rules', 'vue/multi-word-component-names'])).toBe(
      'rules.vue/multi-word-component-names',
    )
  })

  it('falls back to brackets when a segment contains a literal dot', () => {
    expect(formatPathExpression(['rules', 'a.b'])).toBe('rules["a.b"]')
  })

  it('formats a single top-level segment without a leading dot', () => {
    expect(formatPathExpression(['printWidth'])).toBe('printWidth')
  })

  it('rejects formatting an empty path', () => {
    expect(() => formatPathExpression([])).toThrow(PathParseError)
  })
})

describe('matchesPattern', () => {
  it('matches a single wildcard segment against any value at that position', () => {
    expect(matchesPattern(['rules', '*'], ['rules', 'no-console'])).toBe(true)
    expect(matchesPattern(['rules', '*'], ['rules', 'vue/multi-word-component-names'])).toBe(true)
  })

  it('does not match when the non-wildcard segments differ', () => {
    expect(matchesPattern(['rules', '*'], ['other', 'no-console'])).toBe(false)
  })

  it('does not match when lengths differ (wildcard is single-segment, not recursive)', () => {
    expect(matchesPattern(['rules', '*'], ['rules'])).toBe(false)
    expect(matchesPattern(['rules', '*'], ['rules', 'a', 'b'])).toBe(false)
  })

  it('matches a bare top-level wildcard against any single top-level key', () => {
    expect(matchesPattern(['*'], ['semi'])).toBe(true)
    expect(matchesPattern(['*'], ['rules', 'no-console'])).toBe(false)
  })
})
