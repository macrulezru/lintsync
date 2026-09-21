import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runSyncBatch } from '../../commands/sync-batch.js'
import { serializeManifest, type Manifest } from '../../merge-engine/manifest.js'
import { serializeRegistry } from '../../registry/registry.js'
import type { ProjectsRegistry } from '../../registry/types.js'
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

let rootDir: string
let registryPath: string

beforeEach(() => {
  rootDir = mkdtempSync(join(tmpdir(), 'lintsync-sync-batch-test-'))
  registryPath = join(rootDir, 'projects.json')
})

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true })
})

function makeProject(name: string, manifest: Manifest, files: Record<string, string>): string {
  const dir = join(rootDir, name)
  mkdirSync(join(dir, '.lintsync'), { recursive: true })
  writeFileSync(join(dir, '.lintsync', 'manifest.json'), serializeManifest(manifest))
  for (const [relativePath, content] of Object.entries(files)) {
    writeFileSync(join(dir, relativePath), content)
  }
  return dir
}

function writeRegistry(registry: ProjectsRegistry): void {
  writeFileSync(registryPath, serializeRegistry(registry))
}

describe('runSyncBatch (spec 7.5.3/8: sync --all)', () => {
  it('runs sync for every registered project and reports each under its registered name', async () => {
    const cleanDir = makeProject(
      'clean-project',
      {
        prettier: {
          preset: 'test-preset',
          version: '2.0.0',
          configPath: '.prettierrc.json',
          managed: { semi: { presetValue: false, version: '2.0.0' } },
        },
      },
      { '.prettierrc.json': '{\n  "semi": false\n}\n' },
    )
    const conflictDir = makeProject(
      'conflict-project',
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
    writeRegistry({
      projects: [
        { name: 'clean-project', path: cleanDir, tags: [] },
        { name: 'conflict-project', path: conflictDir, tags: [] },
      ],
    })

    const batch = await runSyncBatch({ registryPath, dryRun: false, yes: true, presetRegistry })

    // one project clean (exitCode 0), the other conflicting (exitCode 1) -> mixed -> 3
    expect(batch.exitCode).toBe(3)
    expect(batch.projects.map((p) => ({ project: p.project, status: p.tools[0]?.status }))).toEqual(
      [
        { project: 'clean-project', status: 'clean' },
        { project: 'conflict-project', status: 'conflict' },
      ],
    )
  })

  it('filters to a tag subset', async () => {
    const siteDir = makeProject('site-project', {}, {})
    const libDir = makeProject('lib-project', {}, {})
    writeRegistry({
      projects: [
        { name: 'site-project', path: siteDir, tags: ['site'] },
        { name: 'lib-project', path: libDir, tags: ['npm-package'] },
      ],
    })

    const batch = await runSyncBatch({
      registryPath,
      tag: 'site',
      dryRun: false,
      yes: true,
      presetRegistry,
    })

    expect(batch.projects.map((p) => p.project)).toEqual(['site-project'])
  })

  it('aggregates exitCode 3 when projects disagree (spec 7.5.3)', async () => {
    const errorDir = join(rootDir, 'no-manifest-project')
    mkdirSync(errorDir, { recursive: true }) // no .lintsync/manifest.json at all -> whole-project error (2)
    const conflictDir = makeProject(
      'conflict-project-2',
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
    writeRegistry({
      projects: [
        { name: 'no-manifest-project', path: errorDir, tags: [] },
        { name: 'conflict-project-2', path: conflictDir, tags: [] },
      ],
    })

    const batch = await runSyncBatch({ registryPath, dryRun: false, yes: true, presetRegistry })

    expect(batch.projects.map((p) => p.exitCode)).toEqual([2, 1])
    expect(batch.exitCode).toBe(3)
  })

  it('never writes anything without --yes, across the whole batch', async () => {
    const dir = makeProject(
      'safe-project',
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
    writeRegistry({ projects: [{ name: 'safe-project', path: dir, tags: [] }] })

    await runSyncBatch({ registryPath, dryRun: false, yes: false, presetRegistry })

    expect(readFileSync(join(dir, '.prettierrc.json'), 'utf8')).toBe('{\n  "semi": true\n}\n')
  })
})
