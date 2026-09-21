import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runSync } from '../../commands/sync.js'
import { parseManifest, serializeManifest, type Manifest } from '../../merge-engine/manifest.js'
import type { Preset, PresetRegistry } from '../../presets/types.js'
import type { ConflictItem, Resolution } from '../../tui/types.js'

/**
 * A real "fixture project" on disk (spec 12.2 stage 4 exit criterion), not the built-in
 * vue-app/npm-lib presets (those don't exist yet — they land with `init` in stage 9). This
 * fake registry stands in for a real one so the CLI's file-reading/writing plumbing can be
 * exercised end-to-end without depending on unwritten preset content.
 */
const testPreset: Preset = {
  name: 'test-preset',
  version: '2.0.0',
  tools: {
    eslint: { rules: { 'no-console': 'warn', 'no-debugger': 'error' }, managedKeys: ['rules.*'] },
    prettier: { rules: { semi: false }, managedKeys: ['*'] },
  },
}
const presetRegistry: PresetRegistry = {
  getPreset: (name) => (name === 'test-preset' ? testPreset : undefined),
}

let projectDir: string

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'lintsync-sync-test-'))
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

/** Resolves every conflict it's handed by always picking accept-preset — a stand-in for a user
 *  driving the real TUI, without needing to drive an actual terminal in these tests (that's
 *  covered separately by ConflictResolver.test.tsx). */
function acceptPresetResolver(conflicts: ConflictItem[]): Promise<Resolution[]> {
  return Promise.resolve(
    conflicts.map((conflict) => ({
      path: conflict.path,
      choice: 'accept-preset',
      value: conflict.presetValue,
    })),
  )
}

describe('runSync (real filesystem, JSON adapter)', () => {
  it('reports an exitCode-2 error when there is no .lintsync/manifest.json', async () => {
    const report = await runSync({
      cwd: projectDir,
      dryRun: false,
      yes: false,
      interactive: false,
      presetRegistry,
    })
    expect(report.exitCode).toBe(2)
    expect(report.tools).toEqual([])
    expect(report.error).toMatch(/No manifest found/)
  })

  it('previews a change with --dry-run without writing the file', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: 'eslint.config.json',
          managed: { 'rules.no-console': { presetValue: 'off', version: '1.0.0' } },
        },
      },
      { 'eslint.config.json': '{\n  "rules": {\n    "no-console": "off"\n  }\n}\n' },
    )

    const report = await runSync({
      cwd: projectDir,
      dryRun: true,
      yes: false,
      interactive: false,
      presetRegistry,
    })

    expect(report.exitCode).toBe(0)
    expect(report.tools[0]?.status).toBe('would-update')
    expect(report.tools[0]?.changes).toEqual([
      { path: ['rules', 'no-console'], from: 'off', to: 'warn' },
      // 'no-debugger' is in the preset but not yet in this file/manifest, so it's a new
      // managed key to add (undefined -> preset value), same as merge-engine's own tests.
      { path: ['rules', 'no-debugger'], from: undefined, to: 'error' },
    ])

    const fileOnDisk = readFileSync(join(projectDir, 'eslint.config.json'), 'utf8')
    expect(fileOnDisk).toContain('"no-console": "off"')
  })

  it('does not write without --yes even when there is no conflict (no confirmation prompt for safe changes)', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: 'eslint.config.json',
          managed: { 'rules.no-console': { presetValue: 'off', version: '1.0.0' } },
        },
      },
      { 'eslint.config.json': '{\n  "rules": {\n    "no-console": "off"\n  }\n}\n' },
    )

    const report = await runSync({
      cwd: projectDir,
      dryRun: false,
      yes: false,
      interactive: false,
      presetRegistry,
    })

    expect(report.exitCode).toBe(0)
    expect(report.tools[0]?.status).toBe('would-update')
    const fileOnDisk = readFileSync(join(projectDir, 'eslint.config.json'), 'utf8')
    expect(fileOnDisk).toContain('"no-console": "off"')
  })

  it('applies the change and updates the manifest with --yes', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: 'eslint.config.json',
          managed: {
            'rules.no-console': { presetValue: 'off', version: '1.0.0' },
            'rules.no-debugger': { presetValue: 'error', version: '1.0.0' },
          },
        },
      },
      {
        'eslint.config.json':
          '{\n  "rules": {\n    "no-console": "off",\n    "no-debugger": "error"\n  }\n}\n',
      },
    )

    const report = await runSync({
      cwd: projectDir,
      dryRun: false,
      yes: true,
      interactive: false,
      presetRegistry,
    })

    expect(report.exitCode).toBe(0)
    expect(report.tools[0]?.status).toBe('updated')

    const fileOnDisk = readFileSync(join(projectDir, 'eslint.config.json'), 'utf8')
    expect(fileOnDisk).toBe(
      '{\n  "rules": {\n    "no-console": "warn",\n    "no-debugger": "error"\n  }\n}\n',
    )

    const manifest = parseManifest(
      readFileSync(join(projectDir, '.lintsync', 'manifest.json'), 'utf8'),
    )
    expect(manifest.eslint?.version).toBe('2.0.0')
    expect(manifest.eslint?.managed['rules.no-console']).toEqual({
      presetValue: 'warn',
      version: '2.0.0',
    })
  })

  it('reports a conflict and leaves the file and manifest untouched when non-interactive, even with --yes', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: 'eslint.config.json',
          managed: { 'rules.no-console': { presetValue: 'off', version: '1.0.0' } },
        },
      },
      // user manually set it to 'error', diverging from both manifest ('off') and preset ('warn')
      { 'eslint.config.json': '{\n  "rules": {\n    "no-console": "error"\n  }\n}\n' },
    )

    const report = await runSync({
      cwd: projectDir,
      dryRun: false,
      yes: true,
      interactive: false,
      presetRegistry,
    })

    expect(report.exitCode).toBe(1)
    expect(report.tools[0]?.status).toBe('conflict')

    const fileOnDisk = readFileSync(join(projectDir, 'eslint.config.json'), 'utf8')
    expect(fileOnDisk).toContain('"no-console": "error"')

    const manifestOnDisk = readFileSync(join(projectDir, '.lintsync', 'manifest.json'), 'utf8')
    expect(parseManifest(manifestOnDisk).eslint?.managed['rules.no-console']).toEqual({
      presetValue: 'off',
      version: '1.0.0',
    })
  })

  it('reports a per-tool error for an unregistered preset without crashing', async () => {
    initProject(
      {
        eslint: {
          preset: 'does-not-exist',
          version: '1.0.0',
          configPath: 'eslint.config.json',
          managed: {},
        },
      },
      { 'eslint.config.json': '{}' },
    )

    const report = await runSync({
      cwd: projectDir,
      dryRun: false,
      yes: true,
      interactive: false,
      presetRegistry,
    })

    expect(report.exitCode).toBe(2)
    expect(report.tools[0]).toMatchObject({
      status: 'error',
      error: expect.stringContaining('not registered'),
    })
  })

  it('reports a per-tool error when the config file itself is missing', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: 'eslint.config.json',
          managed: {},
        },
      },
      {},
    )

    const report = await runSync({
      cwd: projectDir,
      dryRun: false,
      yes: true,
      interactive: false,
      presetRegistry,
    })

    expect(report.exitCode).toBe(2)
    expect(report.tools[0]).toMatchObject({
      status: 'error',
      error: expect.stringContaining('not found'),
    })
  })

  it('restricts to a single tool with --tool', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: 'eslint.config.json',
          managed: { 'rules.no-console': { presetValue: 'off', version: '1.0.0' } },
        },
        prettier: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: '.prettierrc.json',
          managed: {},
        },
      },
      {
        'eslint.config.json': '{\n  "rules": {\n    "no-console": "off"\n  }\n}\n',
        '.prettierrc.json': '{}',
      },
    )

    const report = await runSync({
      cwd: projectDir,
      dryRun: true,
      yes: false,
      interactive: false,
      tool: 'eslint',
      presetRegistry,
    })

    expect(report.tools).toHaveLength(1)
    expect(report.tools[0]?.tool).toBe('eslint')
  })

  it('applies a change to a real .yaml config file, preserving comments', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: 'eslint.config.yaml',
          managed: { 'rules.no-console': { presetValue: 'off', version: '1.0.0' } },
        },
      },
      {
        'eslint.config.yaml': `# team config
rules:
  no-console: off
  no-debugger: error
`,
      },
    )

    const report = await runSync({
      cwd: projectDir,
      dryRun: false,
      yes: true,
      interactive: false,
      presetRegistry,
    })

    expect(report.exitCode).toBe(0)
    expect(report.tools[0]?.status).toBe('updated')

    const fileOnDisk = readFileSync(join(projectDir, 'eslint.config.yaml'), 'utf8')
    expect(fileOnDisk).toBe(`# team config
rules:
  no-console: warn
  no-debugger: error
`)
  })

  it('applies a change to a real flat-config .js file, preserving comments', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: 'eslint.config.js',
          managed: { 'rules.no-console': { presetValue: 'off', version: '1.0.0' } },
        },
      },
      {
        'eslint.config.js': `// team config
export default {
  rules: {
    'no-console': 'off',
    'no-debugger': 'error',
  },
}
`,
      },
    )

    const report = await runSync({
      cwd: projectDir,
      dryRun: false,
      yes: true,
      interactive: false,
      presetRegistry,
    })

    expect(report.exitCode).toBe(0)
    expect(report.tools[0]?.status).toBe('updated')

    const fileOnDisk = readFileSync(join(projectDir, 'eslint.config.js'), 'utf8')
    expect(fileOnDisk).toBe(`// team config
export default {
  rules: {
    'no-console': 'warn',
    'no-debugger': 'error',
  },
}
`)
  })

  it('reports a per-tool error instead of crashing when a .js config value is a dynamic expression', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
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

    const report = await runSync({
      cwd: projectDir,
      dryRun: false,
      yes: true,
      interactive: false,
      presetRegistry,
    })

    expect(report.exitCode).toBe(2)
    expect(report.tools[0]).toMatchObject({
      status: 'error',
      error: expect.stringContaining('dynamic expression'),
    })

    // the file must be left completely untouched
    const fileOnDisk = readFileSync(join(projectDir, 'eslint.config.js'), 'utf8')
    expect(fileOnDisk).toContain('someImportedVar')
  })
})

describe('runSync (interactive conflict resolution, spec stage 8)', () => {
  it('never invokes the resolver when interactive is false, even with a conflict', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: 'eslint.config.json',
          managed: { 'rules.no-console': { presetValue: 'off', version: '1.0.0' } },
        },
      },
      { 'eslint.config.json': '{\n  "rules": {\n    "no-console": "error"\n  }\n}\n' },
    )

    let called = false
    const report = await runSync({
      cwd: projectDir,
      dryRun: false,
      yes: false,
      interactive: false,
      presetRegistry,
      resolveConflicts: async (conflicts) => {
        called = true
        return acceptPresetResolver(conflicts)
      },
    })

    expect(called).toBe(false)
    expect(report.tools[0]?.status).toBe('conflict')
  })

  it('never invokes the resolver when --yes is set, even if interactive is true', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: 'eslint.config.json',
          managed: { 'rules.no-console': { presetValue: 'off', version: '1.0.0' } },
        },
      },
      { 'eslint.config.json': '{\n  "rules": {\n    "no-console": "error"\n  }\n}\n' },
    )

    let called = false
    const report = await runSync({
      cwd: projectDir,
      dryRun: false,
      yes: true,
      interactive: true,
      presetRegistry,
      resolveConflicts: async (conflicts) => {
        called = true
        return acceptPresetResolver(conflicts)
      },
    })

    expect(called).toBe(false)
    expect(report.tools[0]?.status).toBe('conflict')
  })

  it('never invokes the resolver with --dry-run, even if interactive is true', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: 'eslint.config.json',
          managed: { 'rules.no-console': { presetValue: 'off', version: '1.0.0' } },
        },
      },
      { 'eslint.config.json': '{\n  "rules": {\n    "no-console": "error"\n  }\n}\n' },
    )

    let called = false
    const report = await runSync({
      cwd: projectDir,
      dryRun: true,
      yes: false,
      interactive: true,
      presetRegistry,
      resolveConflicts: async (conflicts) => {
        called = true
        return acceptPresetResolver(conflicts)
      },
    })

    expect(called).toBe(false)
    expect(report.tools[0]?.status).toBe('conflict')
  })

  it('resolves a conflict interactively, applies it, and updates the manifest — full cycle', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: 'eslint.config.json',
          managed: {
            'rules.no-console': { presetValue: 'off', version: '1.0.0' },
            'rules.no-debugger': { presetValue: 'error', version: '1.0.0' },
          },
        },
      },
      // 'no-console' conflicts (user set 'error', manifest says 'off', preset says 'warn');
      // 'no-debugger' already matches the preset — clean, alongside the conflict.
      {
        'eslint.config.json':
          '{\n  "rules": {\n    "no-console": "error",\n    "no-debugger": "error"\n  }\n}\n',
      },
    )

    const report = await runSync({
      cwd: projectDir,
      dryRun: false,
      yes: false,
      interactive: true,
      presetRegistry,
      resolveConflicts: acceptPresetResolver,
    })

    expect(report.exitCode).toBe(0)
    expect(report.tools[0]?.status).toBe('updated')
    expect(report.tools[0]?.conflicts).toEqual([])

    const fileOnDisk = readFileSync(join(projectDir, 'eslint.config.json'), 'utf8')
    expect(fileOnDisk).toBe(
      '{\n  "rules": {\n    "no-console": "warn",\n    "no-debugger": "error"\n  }\n}\n',
    )

    const manifest = parseManifest(
      readFileSync(join(projectDir, '.lintsync', 'manifest.json'), 'utf8'),
    )
    expect(manifest.eslint?.version).toBe('2.0.0')
    expect(manifest.eslint?.managed['rules.no-console']).toEqual({
      presetValue: 'warn',
      version: '2.0.0',
    })
  })

  it('applies a "keep local" resolution to the file, but still records the preset value in the manifest', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: 'eslint.config.json',
          managed: { 'rules.no-console': { presetValue: 'off', version: '1.0.0' } },
        },
      },
      { 'eslint.config.json': '{\n  "rules": {\n    "no-console": "error"\n  }\n}\n' },
    )

    const report = await runSync({
      cwd: projectDir,
      dryRun: false,
      yes: false,
      interactive: true,
      presetRegistry,
      resolveConflicts: (conflicts) =>
        Promise.resolve(
          conflicts.map((conflict) => ({
            path: conflict.path,
            choice: 'keep-local' as const,
            value: conflict.fileValue,
          })),
        ),
    })

    expect(report.exitCode).toBe(0)
    expect(report.tools[0]?.status).toBe('updated')

    // the file keeps the user's value ('error'), unchanged
    const fileOnDisk = readFileSync(join(projectDir, 'eslint.config.json'), 'utf8')
    expect(fileOnDisk).toContain('"no-console": "error"')

    // but the manifest tracks the preset's own value, not the local override (spec 7.2 has no
    // field for "intentionally diverges forever" — this key will conflict again next sync
    // unless the file or the preset changes)
    const manifest = parseManifest(
      readFileSync(join(projectDir, '.lintsync', 'manifest.json'), 'utf8'),
    )
    expect(manifest.eslint?.managed['rules.no-console']).toEqual({
      presetValue: 'warn',
      version: '2.0.0',
    })
  })

  it('leaves everything untouched if the resolver returns fewer resolutions than conflicts', async () => {
    initProject(
      {
        eslint: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: 'eslint.config.json',
          managed: { 'rules.no-console': { presetValue: 'off', version: '1.0.0' } },
        },
      },
      { 'eslint.config.json': '{\n  "rules": {\n    "no-console": "error"\n  }\n}\n' },
    )

    const report = await runSync({
      cwd: projectDir,
      dryRun: false,
      yes: false,
      interactive: true,
      presetRegistry,
      resolveConflicts: () => Promise.resolve([]), // e.g. the user quit out of the TUI early
    })

    expect(report.tools[0]?.status).toBe('conflict')
    const fileOnDisk = readFileSync(join(projectDir, 'eslint.config.json'), 'utf8')
    expect(fileOnDisk).toContain('"no-console": "error"')
  })
})
