import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runInit } from '../../commands/init.js'
import { parseManifest } from '../../merge-engine/manifest.js'
import { builtinPresets } from '../../presets/registry.js'
import type { Preset, PresetRegistry } from '../../presets/types.js'

/** Records install calls instead of touching the network — every test uses this. */
function fakeInstaller() {
  const calls: { agent: string; packages: string[]; cwd: string }[] = []
  return {
    calls,
    install: async (agent: string, packages: string[], cwd: string) => {
      calls.push({ agent, packages, cwd })
    },
  }
}

let projectDir: string

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'lintsync-init-test-'))
  writeFileSync(
    join(projectDir, 'package.json'),
    JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2),
  )
})

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

describe('runInit (real filesystem, builtin presets)', () => {
  it('creates all 3 vue-app configs + manifest.json + npm scripts in one run (spec 12.2 stage 9 exit criterion)', async () => {
    const { calls, install } = fakeInstaller()

    const report = await runInit({
      cwd: projectDir,
      presetName: 'vue-app',
      force: false,
      presetRegistry: builtinPresets,
      installDependencies: install,
    })

    expect(report.exitCode).toBe(0)
    expect(report.error).toBeNull()
    expect(report.tools.map((t) => ({ tool: t.tool, status: t.status }))).toEqual([
      { tool: 'eslint', status: 'created' },
      { tool: 'prettier', status: 'created' },
      { tool: 'stylelint', status: 'created' },
    ])

    // all 3 config files exist
    expect(readFileSync(join(projectDir, 'eslint.config.mjs'), 'utf8')).toContain(
      'import pluginVue',
    )
    expect(JSON.parse(readFileSync(join(projectDir, '.prettierrc.json'), 'utf8'))).toEqual({
      semi: false,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
      tabWidth: 2,
      vueIndentScriptAndStyle: false,
    })
    expect(JSON.parse(readFileSync(join(projectDir, '.stylelintrc.json'), 'utf8'))).toMatchObject({
      extends: ['stylelint-config-standard-scss', 'stylelint-config-recommended-vue'],
    })

    // .lintsync/manifest.json created with all 3 tools
    const manifest = parseManifest(
      readFileSync(join(projectDir, '.lintsync', 'manifest.json'), 'utf8'),
    )
    expect(Object.keys(manifest).sort()).toEqual(['eslint', 'prettier', 'stylelint'])
    expect(manifest.eslint).toMatchObject({
      preset: 'vue-app',
      version: '0.1.0',
      configPath: 'eslint.config.mjs',
    })
    expect(manifest.eslint?.managed['rules.no-console']).toEqual({
      presetValue: 'warn',
      version: '0.1.0',
    })

    // npm scripts wired
    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'))
    expect(pkg.scripts).toEqual({
      lint: 'eslint .',
      'lint:fix': 'eslint . --fix',
      format: 'prettier --write .',
    })
    expect(pkg.name).toBe('fixture') // untouched

    // dependencies installed via the (fake) detected package manager, one call, deduped+sorted
    expect(calls).toHaveLength(1)
    expect(calls[0]?.packages).toEqual(
      [
        ...new Set([
          'eslint',
          'typescript-eslint',
          'eslint-plugin-vue',
          '@eslint/js',
          'vue-eslint-parser',
          'prettier',
          'stylelint',
          'stylelint-config-standard-scss',
          'stylelint-config-recommended-vue',
        ]),
      ].sort(),
    )
    expect(report.dependenciesInstalled).toEqual(calls[0]?.packages)
  })

  it('creates only eslint and prettier for npm-lib (no stylelint, spec 11.2)', async () => {
    const { install } = fakeInstaller()
    const report = await runInit({
      cwd: projectDir,
      presetName: 'npm-lib',
      force: false,
      presetRegistry: builtinPresets,
      installDependencies: install,
    })

    expect(report.exitCode).toBe(0)
    expect(report.tools.map((t) => t.tool)).toEqual(['eslint', 'prettier'])
    expect(readFileSync(join(projectDir, 'eslint.config.mjs'), 'utf8')).not.toContain(
      'eslint-plugin-vue',
    )
  })

  it('initializes a single tool when given a positional tool argument', async () => {
    const { calls, install } = fakeInstaller()
    const report = await runInit({
      cwd: projectDir,
      presetName: 'vue-app',
      tool: 'prettier',
      force: false,
      presetRegistry: builtinPresets,
      installDependencies: install,
    })

    expect(report.tools).toEqual([
      { tool: 'prettier', configPath: '.prettierrc.json', status: 'created', message: null },
    ])
    expect(() => readFileSync(join(projectDir, 'eslint.config.mjs'))).toThrow()
    expect(calls[0]?.packages).toEqual(['prettier'])

    const manifest = parseManifest(
      readFileSync(join(projectDir, '.lintsync', 'manifest.json'), 'utf8'),
    )
    expect(Object.keys(manifest)).toEqual(['prettier'])
  })

  it('skips a tool whose config already exists, without --force, but still creates the others', async () => {
    writeFileSync(join(projectDir, '.prettierrc.json'), '{"semi": true}\n')
    const { install } = fakeInstaller()

    const report = await runInit({
      cwd: projectDir,
      presetName: 'npm-lib',
      force: false,
      presetRegistry: builtinPresets,
      installDependencies: install,
    })

    expect(report.exitCode).toBe(0)
    expect(report.tools).toEqual([
      { tool: 'eslint', configPath: 'eslint.config.mjs', status: 'created', message: null },
      {
        tool: 'prettier',
        configPath: '.prettierrc.json',
        status: 'skipped',
        message: 'Config already exists at .prettierrc.json (use --force to overwrite)',
      },
    ])

    // untouched
    expect(readFileSync(join(projectDir, '.prettierrc.json'), 'utf8')).toBe('{"semi": true}\n')

    // only eslint's manifest entry and dependencies were created
    const manifest = parseManifest(
      readFileSync(join(projectDir, '.lintsync', 'manifest.json'), 'utf8'),
    )
    expect(Object.keys(manifest)).toEqual(['eslint'])
  })

  it('overwrites an existing config with --force', async () => {
    writeFileSync(join(projectDir, '.prettierrc.json'), '{"semi": true}\n')
    const { install } = fakeInstaller()

    const report = await runInit({
      cwd: projectDir,
      presetName: 'npm-lib',
      tool: 'prettier',
      force: true,
      presetRegistry: builtinPresets,
      installDependencies: install,
    })

    expect(report.tools[0]?.status).toBe('created')
    expect(JSON.parse(readFileSync(join(projectDir, '.prettierrc.json'), 'utf8'))).toEqual({
      semi: false,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
      tabWidth: 2,
    })
  })

  it('detects an existing eslint config under a different extension than the preset would use, instead of writing a second file', async () => {
    // the preset's own configFileName is eslint.config.mjs; the project already has a plain
    // .js one — a real bug found by dogfooding init on lintsync's own repo (spec 12.2 stage 12).
    writeFileSync(join(projectDir, 'eslint.config.js'), 'export default { rules: {} }\n')
    const { install } = fakeInstaller()

    const report = await runInit({
      cwd: projectDir,
      presetName: 'npm-lib',
      tool: 'eslint',
      force: false,
      presetRegistry: builtinPresets,
      installDependencies: install,
    })

    expect(report.tools).toEqual([
      {
        tool: 'eslint',
        configPath: 'eslint.config.js',
        status: 'skipped',
        message: 'Config already exists at eslint.config.js (use --force to overwrite)',
      },
    ])
    // no second file was created
    expect(() => readFileSync(join(projectDir, 'eslint.config.mjs'))).toThrow()
    expect(readFileSync(join(projectDir, 'eslint.config.js'), 'utf8')).toBe(
      'export default { rules: {} }\n',
    )
  })

  it('with --force, overwrites the differently-named existing file rather than creating a new one', async () => {
    writeFileSync(join(projectDir, 'eslint.config.js'), 'export default { rules: {} }\n')
    const { install } = fakeInstaller()

    const report = await runInit({
      cwd: projectDir,
      presetName: 'npm-lib',
      tool: 'eslint',
      force: true,
      presetRegistry: builtinPresets,
      installDependencies: install,
    })

    expect(report.tools[0]).toMatchObject({ status: 'created', configPath: 'eslint.config.js' })
    expect(() => readFileSync(join(projectDir, 'eslint.config.mjs'))).toThrow()
    expect(readFileSync(join(projectDir, 'eslint.config.js'), 'utf8')).toContain('no-console')

    const manifest = parseManifest(
      readFileSync(join(projectDir, '.lintsync', 'manifest.json'), 'utf8'),
    )
    expect(manifest.eslint?.configPath).toBe('eslint.config.js')
  })

  it('merges new tool entries into an existing manifest without disturbing others', async () => {
    mkdirSync(join(projectDir, '.lintsync'), { recursive: true })
    writeFileSync(
      join(projectDir, '.lintsync', 'manifest.json'),
      JSON.stringify({
        stylelint: {
          preset: 'vue-app',
          version: '0.1.0',
          configPath: '.stylelintrc.json',
          managed: {},
        },
      }),
    )
    const { install } = fakeInstaller()

    await runInit({
      cwd: projectDir,
      presetName: 'npm-lib',
      tool: 'prettier',
      force: false,
      presetRegistry: builtinPresets,
      installDependencies: install,
    })

    const manifest = parseManifest(
      readFileSync(join(projectDir, '.lintsync', 'manifest.json'), 'utf8'),
    )
    expect(Object.keys(manifest).sort()).toEqual(['prettier', 'stylelint'])
  })

  it('reports an error for an unregistered preset, without crashing', async () => {
    const report = await runInit({
      cwd: projectDir,
      presetName: 'does-not-exist',
      force: false,
      presetRegistry: builtinPresets,
    })
    expect(report.exitCode).toBe(2)
    expect(report.error).toContain('not registered')
  })

  it('reports an error for a tool the preset does not define', async () => {
    const report = await runInit({
      cwd: projectDir,
      presetName: 'npm-lib',
      tool: 'stylelint',
      force: false,
      presetRegistry: builtinPresets,
    })
    expect(report.exitCode).toBe(2)
    expect(report.error).toContain('does not define tool')
  })

  it('does not install anything or touch scripts when every tool was skipped', async () => {
    writeFileSync(join(projectDir, 'eslint.config.mjs'), 'export default {}\n')
    writeFileSync(join(projectDir, '.prettierrc.json'), '{}\n')
    const { calls, install } = fakeInstaller()

    const report = await runInit({
      cwd: projectDir,
      presetName: 'npm-lib',
      force: false,
      presetRegistry: builtinPresets,
      installDependencies: install,
    })

    expect(report.tools.every((t) => t.status === 'skipped')).toBe(true)
    expect(calls).toHaveLength(0)
    expect(report.scriptsUpdated).toEqual([])
    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8'))
    expect(pkg.scripts).toBeUndefined()
  })

  it('leaves configs/manifest intact and reports an error if dependency installation fails', async () => {
    const report = await runInit({
      cwd: projectDir,
      presetName: 'npm-lib',
      force: false,
      presetRegistry: builtinPresets,
      installDependencies: async () => {
        throw new Error('network unreachable')
      },
    })

    expect(report.exitCode).toBe(2)
    expect(report.error).toContain('network unreachable')
    // the configs were still written -- install failure doesn't roll them back
    expect(() => readFileSync(join(projectDir, 'eslint.config.mjs'))).not.toThrow()
    expect(() => readFileSync(join(projectDir, '.lintsync', 'manifest.json'))).not.toThrow()
  })

  it('uses a custom preset registry (not just the built-in one)', async () => {
    const customPreset: Preset = {
      name: 'custom',
      version: '9.9.9',
      tools: {
        prettier: {
          configFormat: 'json',
          configFileName: '.prettierrc.json',
          dependencies: ['prettier'],
          rules: { semi: true },
          managedKeys: ['*'],
        },
      },
    }
    const registry: PresetRegistry = {
      getPreset: (name) => (name === 'custom' ? customPreset : undefined),
    }

    const report = await runInit({
      cwd: projectDir,
      presetName: 'custom',
      force: false,
      presetRegistry: registry,
      installDependencies: async () => {},
    })

    expect(report.exitCode).toBe(0)
    expect(JSON.parse(readFileSync(join(projectDir, '.prettierrc.json'), 'utf8'))).toEqual({
      semi: true,
    })
  })

  it('initializes a subset of tools via `tools` (the interactive checkbox path), in one pass', async () => {
    const { calls, install } = fakeInstaller()

    const report = await runInit({
      cwd: projectDir,
      presetName: 'base',
      tools: ['eslint', 'stylelint'],
      force: false,
      presetRegistry: builtinPresets,
      installDependencies: install,
    })

    expect(report.tools.map((t) => t.tool)).toEqual(['eslint', 'stylelint'])
    expect(() => readFileSync(join(projectDir, '.prettierrc.json'))).toThrow()
    // one combined install call for both tools' dependencies, not one per tool
    expect(calls).toHaveLength(1)

    const manifest = parseManifest(
      readFileSync(join(projectDir, '.lintsync', 'manifest.json'), 'utf8'),
    )
    expect(Object.keys(manifest).sort()).toEqual(['eslint', 'stylelint'])
  })

  it('reports an error when `tools` names a tool the preset does not define', async () => {
    const report = await runInit({
      cwd: projectDir,
      presetName: 'npm-lib',
      tools: ['eslint', 'stylelint'],
      force: false,
      presetRegistry: builtinPresets,
    })
    expect(report.exitCode).toBe(2)
    expect(report.error).toContain('does not define tool "stylelint"')
  })

  it('asks confirmOverwrite instead of skipping when a config already exists', async () => {
    writeFileSync(join(projectDir, '.prettierrc.json'), '{"semi": true}\n')
    const asked: Array<{ tool: string; path: string }> = []

    const report = await runInit({
      cwd: projectDir,
      presetName: 'npm-lib',
      tool: 'prettier',
      force: false,
      presetRegistry: builtinPresets,
      installDependencies: async () => {},
      confirmOverwrite: async (tool, path) => {
        asked.push({ tool, path })
        return true
      },
    })

    expect(asked).toEqual([{ tool: 'prettier', path: '.prettierrc.json' }])
    expect(report.tools[0]?.status).toBe('created')
    expect(JSON.parse(readFileSync(join(projectDir, '.prettierrc.json'), 'utf8'))).toEqual({
      semi: false,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
      tabWidth: 2,
    })
  })

  it('skips as before when confirmOverwrite resolves false', async () => {
    writeFileSync(join(projectDir, '.prettierrc.json'), '{"semi": true}\n')

    const report = await runInit({
      cwd: projectDir,
      presetName: 'npm-lib',
      tool: 'prettier',
      force: false,
      presetRegistry: builtinPresets,
      installDependencies: async () => {},
      confirmOverwrite: async () => false,
    })

    expect(report.tools[0]?.status).toBe('skipped')
    expect(readFileSync(join(projectDir, '.prettierrc.json'), 'utf8')).toBe('{"semi": true}\n')
  })

  it('never calls confirmOverwrite when the config does not already exist', async () => {
    let called = false

    await runInit({
      cwd: projectDir,
      presetName: 'npm-lib',
      tool: 'prettier',
      force: false,
      presetRegistry: builtinPresets,
      installDependencies: async () => {},
      confirmOverwrite: async () => {
        called = true
        return true
      },
    })

    expect(called).toBe(false)
  })
})
