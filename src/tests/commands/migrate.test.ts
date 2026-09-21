import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runMigrate } from '../../commands/migrate.js'
import { jsAdapter } from '../../merge-engine/js-adapter.js'
import { yamlAdapter } from '../../merge-engine/yaml-adapter.js'

let projectDir: string

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'lintsync-migrate-test-'))
})

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

function write(name: string, content: string): void {
  writeFileSync(join(projectDir, name), content)
}

function read(name: string): string {
  return readFileSync(join(projectDir, name), 'utf8')
}

describe('runMigrate: eslint -> flat (spec 4.4)', () => {
  it('migrates rules losslessly from .eslintrc.json and reports every other key as needing manual review', () => {
    write(
      '.eslintrc.json',
      JSON.stringify(
        {
          extends: ['eslint:recommended', 'plugin:vue/recommended'],
          env: { browser: true, node: true },
          parserOptions: { ecmaVersion: 2020 },
          rules: { 'no-console': 'warn', 'no-unused-vars': ['error', { args: 'none' }] },
        },
        null,
        2,
      ),
    )

    const report = runMigrate({ cwd: projectDir, tool: 'eslint', to: 'flat' })

    expect(report).toMatchObject({
      tool: 'eslint',
      fromPath: '.eslintrc.json',
      toPath: 'eslint.config.mjs',
      migratedKeys: ['rules'],
      exitCode: 0,
      error: null,
    })
    expect(report.needsManualReview.sort()).toEqual(['env', 'extends', 'parserOptions'])

    // the migrated rules are byte-for-byte readable back out via the real js adapter
    const handle = jsAdapter.parse(read('eslint.config.mjs'))
    expect(jsAdapter.getValueAt(handle, ['rules', 'no-console'])).toBe('warn')
    expect(jsAdapter.getValueAt(handle, ['rules', 'no-unused-vars'])).toEqual([
      'error',
      { args: 'none' },
    ])

    // the source file is left untouched -- migrate creates, it does not delete
    expect(read('.eslintrc.json')).toContain('"no-console"')
  })

  it('migrates from a YAML eslintrc', () => {
    write('.eslintrc.yaml', 'rules:\n  no-console: warn\nextends:\n  - eslint:recommended\n')

    const report = runMigrate({ cwd: projectDir, tool: 'eslint', to: 'flat' })

    expect(report.fromPath).toBe('.eslintrc.yaml')
    expect(report.migratedKeys).toEqual(['rules'])
    expect(report.needsManualReview).toEqual(['extends'])
    const handle = jsAdapter.parse(read('eslint.config.mjs'))
    expect(jsAdapter.getValueAt(handle, ['rules', 'no-console'])).toBe('warn')
  })

  it('migrates from a CommonJS .eslintrc.js', () => {
    write('.eslintrc.js', "module.exports = {\n  rules: {\n    'no-console': 'error',\n  },\n}\n")

    const report = runMigrate({ cwd: projectDir, tool: 'eslint', to: 'flat' })

    expect(report.fromPath).toBe('.eslintrc.js')
    const handle = jsAdapter.parse(read('eslint.config.mjs'))
    expect(jsAdapter.getValueAt(handle, ['rules', 'no-console'])).toBe('error')
  })

  it('produces an empty managed rules block when the source has no rules at all', () => {
    write('.eslintrc.json', JSON.stringify({ extends: ['eslint:recommended'] }))

    const report = runMigrate({ cwd: projectDir, tool: 'eslint', to: 'flat' })

    expect(report.migratedKeys).toEqual([])
    expect(report.needsManualReview).toEqual(['extends'])
    expect(read('eslint.config.mjs')).toBe('export default [\n  {\n    rules: {},\n  },\n]\n')
  })

  it('reports an error when no legacy eslint config exists', () => {
    const report = runMigrate({ cwd: projectDir, tool: 'eslint', to: 'flat' })
    expect(report.exitCode).toBe(2)
    expect(report.error).toContain('No existing eslint config found')
  })

  it('refuses to overwrite an existing target file', () => {
    write('.eslintrc.json', '{"rules": {}}')
    write('eslint.config.mjs', 'export default []\n')

    const report = runMigrate({ cwd: projectDir, tool: 'eslint', to: 'flat' })

    expect(report.exitCode).toBe(2)
    expect(report.error).toContain('already exists')
    expect(read('eslint.config.mjs')).toBe('export default []\n') // untouched
  })
})

describe('runMigrate: prettier/stylelint format-for-format (spec 4.4)', () => {
  it('migrates prettier json -> yaml, carrying over every key', () => {
    write('.prettierrc.json', JSON.stringify({ semi: false, singleQuote: true, printWidth: 100 }))

    const report = runMigrate({ cwd: projectDir, tool: 'prettier', to: 'yaml' })

    expect(report).toMatchObject({
      fromPath: '.prettierrc.json',
      toPath: '.prettierrc.yaml',
      migratedKeys: ['semi', 'singleQuote', 'printWidth'],
      needsManualReview: [],
      exitCode: 0,
    })
    const handle = yamlAdapter.parse(read('.prettierrc.yaml'))
    expect(yamlAdapter.getValueAt(handle, ['semi'])).toBe(false)
    expect(yamlAdapter.getValueAt(handle, ['printWidth'])).toBe(100)
  })

  it('migrates prettier yaml -> json', () => {
    write('.prettierrc.yaml', 'semi: false\nsingleQuote: true\n')

    const report = runMigrate({ cwd: projectDir, tool: 'prettier', to: 'json' })

    expect(report.toPath).toBe('.prettierrc.json')
    expect(JSON.parse(read('.prettierrc.json'))).toEqual({ semi: false, singleQuote: true })
  })

  it('migrates prettier json -> js as a real, adapter-manageable export default object', () => {
    write('.prettierrc.json', JSON.stringify({ semi: false, singleQuote: true }))

    const report = runMigrate({ cwd: projectDir, tool: 'prettier', to: 'js' })

    expect(report.toPath).toBe('.prettierrc.js')
    const text = read('.prettierrc.js')
    expect(text).toBe('export default {\n  semi: false,\n  singleQuote: true,\n}\n')
    const handle = jsAdapter.parse(text)
    expect(jsAdapter.getValueAt(handle, ['semi'])).toBe(false)
  })

  it('migrates stylelint json -> yaml', () => {
    write(
      '.stylelintrc.json',
      JSON.stringify({
        extends: ['stylelint-config-standard'],
        rules: { 'no-empty-source': null },
      }),
    )

    const report = runMigrate({ cwd: projectDir, tool: 'stylelint', to: 'yaml' })

    expect(report.toPath).toBe('.stylelintrc.yaml')
    const handle = yamlAdapter.parse(read('.stylelintrc.yaml'))
    expect(yamlAdapter.getValueAt(handle, ['rules', 'no-empty-source'])).toBeNull()
    expect(yamlAdapter.getValueAt(handle, ['extends'])).toEqual(['stylelint-config-standard'])
  })

  it('finds prettier.config.js as a legacy source', () => {
    write('prettier.config.js', 'module.exports = {\n  semi: false,\n}\n')

    const report = runMigrate({ cwd: projectDir, tool: 'prettier', to: 'json' })

    expect(report.fromPath).toBe('prettier.config.js')
    expect(JSON.parse(read('.prettierrc.json'))).toEqual({ semi: false })
  })
})

describe('runMigrate: shared error paths', () => {
  it('reports an error for an unknown tool', () => {
    const report = runMigrate({ cwd: projectDir, tool: 'nope', to: 'json' })
    expect(report.exitCode).toBe(2)
    expect(report.error).toContain('Unknown tool')
  })

  it('reports an error for an unsupported target format for that tool', () => {
    write('.prettierrc.json', '{}')
    const report = runMigrate({ cwd: projectDir, tool: 'prettier', to: 'flat' })
    expect(report.exitCode).toBe(2)
    expect(report.error).toContain('Unsupported target format')
  })

  it('reports an error when source and target would be the same file', () => {
    write('.prettierrc.json', '{}')
    const report = runMigrate({ cwd: projectDir, tool: 'prettier', to: 'json' })
    expect(report.exitCode).toBe(2)
    expect(report.error).toContain('same file')
  })
})
