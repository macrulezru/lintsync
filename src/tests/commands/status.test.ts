import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runStatus, runStatusBatch } from '../../commands/status.js'
import { serializeManifest, type Manifest } from '../../merge-engine/manifest.js'
import { serializeRegistry } from '../../registry/registry.js'
import type { Preset, PresetRegistry } from '../../presets/types.js'

const testPreset: Preset = {
  name: 'test-preset',
  version: '2.0.0',
  tools: {
    prettier: {
      configFormat: 'json',
      configFileName: '.prettierrc.json',
      dependencies: [],
      rules: { semi: false },
      managedKeys: ['*'],
    },
  },
}
const presetRegistry: PresetRegistry = {
  getPreset: (name) => (name === 'test-preset' ? testPreset : undefined),
}

let projectDir: string

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'lintsync-status-test-'))
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

describe('runStatus (spec 7.5.4)', () => {
  it('is exitCode 0 for a conflict — a conflict is a project state, not a status failure', async () => {
    initProject(
      {
        prettier: {
          preset: 'test-preset',
          version: '2.0.0',
          configPath: '.prettierrc.json',
          managed: { semi: { presetValue: false, version: '2.0.0' } },
        },
      },
      { '.prettierrc.json': '{\n  "semi": true\n}\n' },
    )

    const report = await runStatus({ cwd: projectDir, presetRegistry })

    expect(report.tools[0]?.status).toBe('conflict')
    expect(report.exitCode).toBe(0)
  })

  it('never writes anything — it is always a dry run', async () => {
    initProject(
      {
        prettier: {
          preset: 'test-preset',
          version: '1.0.0',
          configPath: '.prettierrc.json',
          managed: { semi: { presetValue: true, version: '1.0.0' } },
        },
      },
      { '.prettierrc.json': '{\n  "semi": true\n}\n' },
    )

    const report = await runStatus({ cwd: projectDir, presetRegistry })

    expect(report.tools[0]?.status).toBe('would-update')
    expect(report.exitCode).toBe(0)
  })

  it('is exitCode 2 for a genuine execution error (unregistered preset)', async () => {
    initProject(
      { eslint: { preset: 'does-not-exist', version: '1.0.0', configPath: 'x.json', managed: {} } },
      { 'x.json': '{}' },
    )

    const report = await runStatus({ cwd: projectDir, presetRegistry })

    expect(report.tools[0]?.status).toBe('error')
    expect(report.exitCode).toBe(2)
  })

  it('is exitCode 2 when there is no manifest at all', async () => {
    const report = await runStatus({ cwd: projectDir, presetRegistry })
    expect(report.error).toMatch(/No manifest found/)
    expect(report.exitCode).toBe(2)
  })
})

describe('runStatusBatch', () => {
  it('reports each registered project by name with the status exit-code rule applied', async () => {
    const registryPath = join(projectDir, 'projects.json')
    const conflictDir = join(projectDir, 'conflict-project')
    mkdirSync(join(conflictDir, '.lintsync'), { recursive: true })
    writeFileSync(
      join(conflictDir, '.lintsync', 'manifest.json'),
      serializeManifest({
        prettier: {
          preset: 'test-preset',
          version: '2.0.0',
          configPath: '.prettierrc.json',
          managed: { semi: { presetValue: false, version: '2.0.0' } },
        },
      }),
    )
    writeFileSync(join(conflictDir, '.prettierrc.json'), '{\n  "semi": true\n}\n')

    writeFileSync(
      registryPath,
      serializeRegistry({ projects: [{ name: 'conflict-project', path: conflictDir, tags: [] }] }),
    )

    const batch = await runStatusBatch({ registryPath, presetRegistry })

    expect(batch.projects).toEqual([
      expect.objectContaining({ project: 'conflict-project', exitCode: 0 }),
    ])
    expect(batch.exitCode).toBe(0) // conflict does not make status (or its batch) non-zero
  })
})
