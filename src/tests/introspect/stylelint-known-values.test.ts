import { describe, expect, it } from 'vitest'
import { STYLELINT_BASE_CONFIGS, STYLELINT_RULES } from '../../introspect/stylelint-known-values.js'

describe('STYLELINT_BASE_CONFIGS', () => {
  it('lists SCSS, Less, and Vue base configs alongside the plain standard config', () => {
    const packages = STYLELINT_BASE_CONFIGS.map((c) => c.package)
    expect(packages).toEqual(
      expect.arrayContaining([
        'stylelint-config-standard',
        'stylelint-config-standard-scss',
        'stylelint-config-standard-less',
        'stylelint-config-recommended-vue',
      ]),
    )
  })

  it('has no duplicate package names', () => {
    const packages = STYLELINT_BASE_CONFIGS.map((c) => c.package)
    expect(new Set(packages).size).toBe(packages.length)
  })
})

describe('STYLELINT_RULES', () => {
  it('covers a broad set of rules (both config-recommended correctness rules and config-standard style rules)', () => {
    expect(STYLELINT_RULES.length).toBeGreaterThanOrEqual(50)
  })

  it('has no duplicate rule names', () => {
    const names = STYLELINT_RULES.map((r) => r.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every rule has a non-empty description', () => {
    for (const rule of STYLELINT_RULES) {
      expect(rule.description.length).toBeGreaterThan(0)
    }
  })

  it('every choice-type rule has at least 2 choices, and its recommended value is one of them', () => {
    for (const rule of STYLELINT_RULES) {
      if (rule.type !== 'choice') {
        continue
      }
      expect(rule.choices).toBeDefined()
      expect(rule.choices!.length).toBeGreaterThanOrEqual(2)
      expect(rule.choices!.map((c) => c.value)).toContain(rule.recommended)
    }
  })

  it('only choice-type rules carry a choices list', () => {
    for (const rule of STYLELINT_RULES) {
      if (rule.type !== 'choice') {
        expect(rule.choices).toBeUndefined()
      }
    }
  })

  it('includes known correctness rules from stylelint-config-recommended', () => {
    const names = new Set(STYLELINT_RULES.map((r) => r.name))
    for (const name of ['no-empty-source', 'block-no-empty', 'property-no-unknown']) {
      expect(names.has(name)).toBe(true)
    }
  })

  it('includes known style rules from stylelint-config-standard, with source-verified choice enums', () => {
    const colorHexLength = STYLELINT_RULES.find((r) => r.name === 'color-hex-length')
    expect(colorHexLength).toMatchObject({
      type: 'choice',
      recommended: 'short',
      choices: [{ value: 'short' }, { value: 'long' }],
    })
  })

  it('includes the SCSS plugin rule needed alongside an SCSS base config', () => {
    const names = new Set(STYLELINT_RULES.map((r) => r.name))
    expect(names.has('scss/at-rule-no-unknown')).toBe(true)
  })
})
