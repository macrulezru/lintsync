import { describe, expect, it } from 'vitest'
import { deepEqual } from '../../merge-engine/deep-equal.js'

describe('deepEqual', () => {
  it('treats identical primitives as equal', () => {
    expect(deepEqual('warn', 'warn')).toBe(true)
    expect(deepEqual(1, 1)).toBe(true)
    expect(deepEqual(undefined, undefined)).toBe(true)
    expect(deepEqual(null, null)).toBe(true)
  })

  it('treats different primitives as unequal', () => {
    expect(deepEqual('warn', 'off')).toBe(false)
    expect(deepEqual(null, undefined)).toBe(false)
    expect(deepEqual(0, false)).toBe(false)
  })

  it('compares arrays structurally, order-sensitively', () => {
    expect(
      deepEqual(['error', { argsIgnorePattern: '^_' }], ['error', { argsIgnorePattern: '^_' }]),
    ).toBe(true)
    expect(deepEqual(['error', 'warn'], ['warn', 'error'])).toBe(false)
    expect(deepEqual(['error'], ['error', 'extra'])).toBe(false)
  })

  it('compares plain objects structurally, key-order-insensitively', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })

  it('does not equate an array with an object', () => {
    expect(deepEqual([], {})).toBe(false)
  })
})
