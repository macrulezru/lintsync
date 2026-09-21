import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseValueArgument, runGet, runSet, runUnset } from '../../commands/edit.js'
import { serializeManifest, type Manifest } from '../../merge-engine/manifest.js'

let projectDir: string

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'lintsync-edit-test-'))
})

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

function initProject(manifest: Manifest, files: Record<string, string>): void {
  mkdirSync(join(projectDir, '.lintsync'), { recursive: true })
  writeFileSync(join(projectDir, '.lintsync', 'manifest.json'), serializeManifest(manifest))
  for (const [relativePath, content] of Object.entries(files)) {
    writeFileSync(join(projectDir, relativePath), content)
  }
}

describe('parseValueArgument', () => {
  it('parses JSON-shaped arguments as their real type', () => {
    expect(parseValueArgument('100')).toBe(100)
    expect(parseValueArgument('true')).toBe(true)
    expect(parseValueArgument('null')).toBeNull()
    expect(parseValueArgument('["warn", {"argsIgnorePattern": "^_"}]')).toEqual([
      'warn',
      { argsIgnorePattern: '^_' },
    ])
  })

  it('falls back to a literal string when the argument is not valid JSON', () => {
    expect(parseValueArgument('off')).toBe('off')
    expect(parseValueArgument('PascalCase')).toBe('PascalCase')
  })
})

describe('runGet / runSet / runUnset across formats (spec 12.2 stage 10)', () => {
  const formats = [
    {
      name: 'json',
      configPath: 'eslint.config.json',
      text: '{\n  "rules": {\n    "no-console": "off"\n  }\n}\n',
    },
    {
      name: 'yaml',
      configPath: 'eslint.config.yaml',
      text: '# team config\nrules:\n  no-console: off\n',
    },
    {
      name: 'js',
      configPath: 'eslint.config.js',
      text: "// team config\nexport default {\n  rules: {\n    'no-console': 'off',\n  },\n}\n",
    },
  ] as const

  for (const format of formats) {
    describe(format.name, () => {
      beforeEach(() => {
        initProject(
          {
            eslint: {
              preset: 'vue-app',
              version: '0.1.0',
              configPath: format.configPath,
              managed: { 'rules.no-console': { presetValue: 'off', version: '0.1.0' } },
            },
          },
          { [format.configPath]: format.text },
        )
      })

      it('get reads an existing value', () => {
        const result = runGet(projectDir, ['eslint', 'rules', 'no-console'])
        expect(result).toMatchObject({ found: true, value: 'off', exitCode: 0, error: null })
      })

      it('get reports not-found for a missing path without crashing', () => {
        const result = runGet(projectDir, ['eslint', 'rules', 'no-unused-vars'])
        expect(result.found).toBe(false)
        expect(result.exitCode).toBe(2)
        expect(result.error).toContain('Path not found')
      })

      it('set writes the new value and leaves the manifest untouched', () => {
        const result = runSet(projectDir, ['eslint', 'rules', 'no-console'], 'warn')
        expect(result).toMatchObject({ applied: true, value: 'warn', exitCode: 0 })

        const expectedSnippet =
          format.name === 'yaml'
            ? 'no-console: warn'
            : format.name === 'js'
              ? "'no-console': 'warn'"
              : '"no-console": "warn"'
        const fileOnDisk = readFileSync(join(projectDir, format.configPath), 'utf8')
        expect(fileOnDisk).toContain(expectedSnippet)

        // manifest still says 'off' -- a manual `set` is not the preset applying anything
        const manifestOnDisk = JSON.parse(
          readFileSync(join(projectDir, '.lintsync', 'manifest.json'), 'utf8'),
        )
        expect(manifestOnDisk.eslint.managed['rules.no-console']).toEqual({
          presetValue: 'off',
          version: '0.1.0',
        })

        // reading it back through `get` now sees the new value
        expect(runGet(projectDir, ['eslint', 'rules', 'no-console']).value).toBe('warn')
      })

      it('set parses a numeric/boolean argument as its real JSON type, not a string', () => {
        const result = runSet(projectDir, ['eslint', 'rules', 'max-lines'], '100')
        expect(result.value).toBe(100)
        expect(runGet(projectDir, ['eslint', 'rules', 'max-lines']).value).toBe(100)
      })

      it('unset removes the field', () => {
        const result = runUnset(projectDir, ['eslint', 'rules', 'no-console'])
        expect(result).toMatchObject({ applied: true, exitCode: 0 })
        expect(runGet(projectDir, ['eslint', 'rules', 'no-console']).found).toBe(false)
      })
    })
  }

  it('js format: set rejects overwriting a dynamic expression instead of clobbering it', () => {
    initProject(
      {
        eslint: {
          preset: 'vue-app',
          version: '0.1.0',
          configPath: 'eslint.config.js',
          managed: {},
        },
      },
      {
        'eslint.config.js': `export default {
  rules: {
    'no-console': someImportedVar,
  },
}
`,
      },
    )

    const result = runSet(projectDir, ['eslint', 'rules', 'no-console'], 'warn')
    expect(result.applied).toBe(false)
    expect(result.exitCode).toBe(2)
    expect(result.error).toContain('dynamic expression')

    const fileOnDisk = readFileSync(join(projectDir, 'eslint.config.js'), 'utf8')
    expect(fileOnDisk).toContain('someImportedVar')
  })
})

describe('resolution failures shared by get/set/unset', () => {
  it('reports an error when there is no manifest at all', () => {
    const result = runGet(projectDir, ['eslint', 'rules', 'no-console'])
    expect(result.exitCode).toBe(2)
    expect(result.error).toMatch(/No manifest found/)
  })

  it('reports an error when the tool is not tracked in the manifest', () => {
    initProject(
      {
        prettier: {
          preset: 'vue-app',
          version: '0.1.0',
          configPath: '.prettierrc.json',
          managed: {},
        },
      },
      { '.prettierrc.json': '{}' },
    )
    const result = runGet(projectDir, ['eslint', 'rules', 'no-console'])
    expect(result.exitCode).toBe(2)
    expect(result.error).toContain('not tracked')
  })

  it('reports an error when the path has no field segment after the tool name', () => {
    initProject(
      {
        eslint: {
          preset: 'vue-app',
          version: '0.1.0',
          configPath: 'eslint.config.json',
          managed: {},
        },
      },
      { 'eslint.config.json': '{}' },
    )
    const result = runGet(projectDir, ['eslint'])
    expect(result.exitCode).toBe(2)
    expect(result.error).toContain('at least one field')
  })

  it('reports an error when the config file itself is missing', () => {
    initProject(
      {
        eslint: {
          preset: 'vue-app',
          version: '0.1.0',
          configPath: 'eslint.config.json',
          managed: {},
        },
      },
      {},
    )
    const result = runSet(projectDir, ['eslint', 'rules', 'no-console'], 'warn')
    expect(result.exitCode).toBe(2)
    expect(result.error).toContain('not found')
  })
})
