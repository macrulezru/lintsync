import { describe, expect, it } from 'vitest'
import { jsAdapter, UnsupportedEditError } from '../../merge-engine/js-adapter.js'
import { NOT_FOUND } from '../../merge-engine/types.js'
import { runConformanceSuite } from './adapter-conformance.js'

const fixtureText = `// eslint config
export default {
  rules: {
    'no-console': 'off',
    'no-debugger': 'error',
  },
}
`

runConformanceSuite('js (export default)', jsAdapter, {
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
    expectedText: `// eslint config
export default {
  rules: {
    'no-console': 'warn',
    'no-debugger': 'error',
  },
}
`,
  },
  deleteValue: {
    text: fixtureText,
    path: ['rules', 'no-debugger'],
    expectedText: `// eslint config
export default {
  rules: {
    'no-console': 'off'
  },
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

describe('js (adapter-specific)', () => {
  it('sets a value at a path that does not exist yet, creating it with a quoted key', () => {
    const text = `export default {
  rules: {
    'no-console': 'warn',
  },
}
`
    const handle = jsAdapter.parse(text)
    const result = jsAdapter.applyEdits(handle, [
      { op: 'set', path: ['rules', '@typescript-eslint/no-unused-vars'], value: 'warn' },
    ])
    expect(result).toBe(`export default {
  rules: {
    'no-console': 'warn',
    '@typescript-eslint/no-unused-vars': 'warn',
  },
}
`)
  })

  it('creates an intermediate object for a brand-new nested path', () => {
    const handle = jsAdapter.parse('export default {}\n')
    const result = jsAdapter.applyEdits(handle, [
      { op: 'set', path: ['rules', 'no-console'], value: 'warn' },
    ])
    expect(result).toBe(`export default {
  rules: {
    'no-console': 'warn',
  },
}
`)
  })

  it('reads and edits a CommonJS `module.exports = {...}` file the same way', () => {
    const text = `module.exports = {
  rules: {
    'no-console': 'off',
  },
}
`
    const handle = jsAdapter.parse(text)
    expect(jsAdapter.getValueAt(handle, ['rules', 'no-console'])).toBe('off')

    const result = jsAdapter.applyEdits(handle, [
      { op: 'set', path: ['rules', 'no-console'], value: 'warn' },
    ])
    expect(result).toBe(`module.exports = {
  rules: {
    'no-console': 'warn',
  },
}
`)
  })

  it('lists top-level keys for a flat config with an empty prefix (e.g. Prettier)', () => {
    const text = `export default {
  semi: false,
  singleQuote: true,
}
`
    const handle = jsAdapter.parse(text)
    expect(jsAdapter.listPaths(handle, [])).toEqual([['semi'], ['singleQuote']])
  })

  it('reads a rule name containing "@" and "/" without treating them as path delimiters', () => {
    const text = `export default {
  rules: {
    '@typescript-eslint/no-unused-vars': 'error',
  },
}
`
    const handle = jsAdapter.parse(text)
    expect(jsAdapter.getValueAt(handle, ['rules', '@typescript-eslint/no-unused-vars'])).toBe(
      'error',
    )
  })

  it('treats a dynamic expression value as NOT_FOUND on read, but still lists its key', () => {
    const text = `export default {
  rules: {
    'no-console': someImportedVar,
  },
}
`
    const handle = jsAdapter.parse(text)
    expect(jsAdapter.getValueAt(handle, ['rules', 'no-console'])).toBe(NOT_FOUND)
    // still listed: sync's expandWildcards must be able to consider it a managed candidate so
    // that attempting to touch it hits the explicit rejection below, rather than silently
    // skipping it as if the key never existed.
    expect(jsAdapter.listPaths(handle, ['rules'])).toEqual([['rules', 'no-console']])
  })

  it('rejects overwriting a dynamic expression instead of silently replacing it', () => {
    const text = `export default {
  rules: {
    'no-console': someImportedVar,
  },
}
`
    const handle = jsAdapter.parse(text)
    expect(() =>
      jsAdapter.applyEdits(handle, [{ op: 'set', path: ['rules', 'no-console'], value: 'warn' }]),
    ).toThrow(UnsupportedEditError)
  })

  it('manages the trailing object of an array export (real flat-config shape, spec 11.1)', () => {
    const text = `import pluginVue from 'eslint-plugin-vue'

export default [
  ...pluginVue.configs['flat/recommended'],
  {
    rules: {
      'no-console': 'off',
    },
  },
]
`
    const handle = jsAdapter.parse(text)
    expect(jsAdapter.getValueAt(handle, ['rules', 'no-console'])).toBe('off')

    const result = jsAdapter.applyEdits(handle, [
      { op: 'set', path: ['rules', 'no-console'], value: 'warn' },
    ])
    expect(result).toBe(`import pluginVue from 'eslint-plugin-vue'

export default [
  ...pluginVue.configs['flat/recommended'],
  {
    rules: {
      'no-console': 'warn',
    },
  },
]
`)
  })

  it('treats an array export with no trailing object literal as having no root, without throwing on read', () => {
    const handle = jsAdapter.parse('export default [...spreadOnly, 42]\n')
    expect(jsAdapter.getValueAt(handle, ['rules'])).toBe(NOT_FOUND)
    expect(jsAdapter.listPaths(handle, [])).toEqual([])
  })

  it('rejects editing when no recognizable object literal export exists at all', () => {
    const handle = jsAdapter.parse('export default [...spreadOnly, 42]\n')
    expect(() => jsAdapter.applyEdits(handle, [{ op: 'set', path: ['rules'], value: {} }])).toThrow(
      UnsupportedEditError,
    )
  })

  it('treats a call-wrapped export (e.g. defineConfig(...)) the same as an unrecognized root', () => {
    const handle = jsAdapter.parse('export default defineConfig({ rules: {} })\n')
    expect(jsAdapter.getValueAt(handle, ['rules'])).toBe(NOT_FOUND)
  })
})
