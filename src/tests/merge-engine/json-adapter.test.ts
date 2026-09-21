import { describe, expect, it } from 'vitest'
import { runConformanceSuite } from './adapter-conformance.js'
import { jsonAdapter } from '../../merge-engine/json-adapter.js'
import { NOT_FOUND } from '../../merge-engine/types.js'

const fixtureText = `{
  // base config
  "extends": ["eslint:recommended"],
  "rules": {
    "no-console": "off",
    "no-debugger": "error"
  }
}
`

runConformanceSuite('json', jsonAdapter, {
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
    expectedText: `{
  // base config
  "extends": ["eslint:recommended"],
  "rules": {
    "no-console": "warn",
    "no-debugger": "error"
  }
}
`,
  },
  deleteValue: {
    text: fixtureText,
    path: ['rules', 'no-debugger'],
    expectedText: `{
  // base config
  "extends": ["eslint:recommended"],
  "rules": {
    "no-console": "off"
  }
}
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

describe('json (adapter-specific)', () => {
  it('sets a value at a path that does not exist yet, creating it', () => {
    const text = `{
  "rules": {
    "no-console": "off"
  }
}
`
    const handle = jsonAdapter.parse(text)
    const result = jsonAdapter.applyEdits(handle, [
      { op: 'set', path: ['rules', '@typescript-eslint/no-unused-vars'], value: 'warn' },
    ])
    expect(result).toBe(`{
  "rules": {
    "no-console": "off",
    "@typescript-eslint/no-unused-vars": "warn"
  }
}
`)
  })

  it('reads a rule name containing "@" and "/" without treating them as path delimiters', () => {
    const text = `{ "rules": { "@typescript-eslint/no-unused-vars": "error" } }`
    const handle = jsonAdapter.parse(text)
    expect(jsonAdapter.getValueAt(handle, ['rules', '@typescript-eslint/no-unused-vars'])).toBe(
      'error',
    )
  })

  it('lists top-level keys for a flat config with an empty prefix (e.g. Prettier)', () => {
    const text = `{
  "semi": false,
  "singleQuote": true
}
`
    const handle = jsonAdapter.parse(text)
    expect(jsonAdapter.listPaths(handle, [])).toEqual([['semi'], ['singleQuote']])
  })

  it('treats unparseable JSON as having no values, without throwing', () => {
    const handle = jsonAdapter.parse('{ not valid json')
    expect(jsonAdapter.getValueAt(handle, ['rules'])).toBe(NOT_FOUND)
    expect(jsonAdapter.listPaths(handle, [])).toEqual([])
  })
})
