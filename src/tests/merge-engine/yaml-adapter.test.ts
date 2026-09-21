import { describe, expect, it } from 'vitest'
import { runConformanceSuite } from './adapter-conformance.js'
import { yamlAdapter } from '../../merge-engine/yaml-adapter.js'
import { NOT_FOUND } from '../../merge-engine/types.js'

const fixtureText = `# base config
extends:
  - eslint:recommended
rules:
  no-console: off
  no-debugger: error
`

runConformanceSuite('yaml', yamlAdapter, {
  readExisting: {
    text: fixtureText,
    path: ['rules', 'no-console'],
    expectedValue: 'off',
  },
  readMissing: {
    text: fixtureText,
    path: ['rules', 'no-unused-vars'],
  },
  setValue: {
    text: fixtureText,
    path: ['rules', 'no-console'],
    value: 'warn',
    expectedText: `# base config
extends:
  - eslint:recommended
rules:
  no-console: warn
  no-debugger: error
`,
  },
  deleteValue: {
    text: fixtureText,
    path: ['rules', 'no-debugger'],
    expectedText: `# base config
extends:
  - eslint:recommended
rules:
  no-console: off
`,
  },
  listPaths: {
    text: fixtureText,
    prefix: ['rules'],
    expectedPaths: [
      ['rules', 'no-console'],
      ['rules', 'no-debugger'],
    ],
  },
})

describe('yaml (adapter-specific)', () => {
  it('sets a value at a path that does not exist yet, creating it', () => {
    const text = `rules:
  no-console: warn
`
    const handle = yamlAdapter.parse(text)
    const result = yamlAdapter.applyEdits(handle, [
      { op: 'set', path: ['rules', '@typescript-eslint/no-unused-vars'], value: 'warn' },
    ])
    expect(result).toBe(`rules:
  no-console: warn
  "@typescript-eslint/no-unused-vars": warn
`)
  })

  it('reads a rule name containing "@" and "/" without treating them as path delimiters', () => {
    const text = `rules:
  "@typescript-eslint/no-unused-vars": error
`
    const handle = yamlAdapter.parse(text)
    expect(yamlAdapter.getValueAt(handle, ['rules', '@typescript-eslint/no-unused-vars'])).toBe(
      'error',
    )
  })

  it('lists top-level keys for a flat config with an empty prefix (e.g. Prettier)', () => {
    const text = `semi: false
singleQuote: true
`
    const handle = yamlAdapter.parse(text)
    expect(yamlAdapter.listPaths(handle, [])).toEqual([['semi'], ['singleQuote']])
  })

  it('reads a nested array-of-object rule option as a plain JS value, not a YAML node', () => {
    const text = `rules:
  no-unused-vars: [error, { argsIgnorePattern: "^_" }]
`
    const handle = yamlAdapter.parse(text)
    const value = yamlAdapter.getValueAt(handle, ['rules', 'no-unused-vars'])
    expect(value).toEqual(['error', { argsIgnorePattern: '^_' }])
  })

  it('does not mutate the parsed handle across repeated applyEdits calls', () => {
    const text = `rules:
  no-console: off
`
    const handle = yamlAdapter.parse(text)
    yamlAdapter.applyEdits(handle, [{ op: 'set', path: ['rules', 'no-console'], value: 'warn' }])
    // a second call starting from the same handle should still see the original value
    expect(yamlAdapter.getValueAt(handle, ['rules', 'no-console'])).toBe('off')
  })

  it('treats a value reachable only through an unresolved YAML merge key as not found', () => {
    // known limitation (spec 7.4.3): merge keys are not flattened by getIn/hasIn.
    const text = `defaults: &defaults
  no-console: warn
rules:
  <<: *defaults
  no-debugger: error
`
    const handle = yamlAdapter.parse(text)
    expect(yamlAdapter.getValueAt(handle, ['rules', 'no-console'])).toBe(NOT_FOUND)
  })

  it('recovers a best-effort partial tree from unterminated YAML, without throwing', () => {
    // yaml's parser is fault-tolerant like jsonc-parser: it recovers what it can rather than
    // producing nothing at all, so the root key it did manage to parse is still listed.
    const handle = yamlAdapter.parse('rules: [unterminated')
    expect(yamlAdapter.listPaths(handle, [])).toEqual([['rules']])
  })
})
