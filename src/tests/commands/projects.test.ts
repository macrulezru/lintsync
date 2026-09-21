import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultRegistryPath,
  loadRegistry,
  runProjectsAdd,
  runProjectsList,
  runProjectsRemove,
} from '../../commands/projects.js'
import { defaultRegistryPath as osDefaultRegistryPath } from '../../config/paths.js'

let dir: string
let registryPath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lintsync-registry-test-'))
  registryPath = join(dir, 'projects.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('runProjectsAdd', () => {
  it('creates the registry file on first add', () => {
    const result = runProjectsAdd(registryPath, 'vuecraft', '~/dev/vuecraft', ['site'])
    expect(result).toEqual({
      project: { name: 'vuecraft', path: '~/dev/vuecraft', tags: ['site'] },
      exitCode: 0,
      error: null,
    })
    expect(loadRegistry(registryPath).projects).toEqual([
      { name: 'vuecraft', path: '~/dev/vuecraft', tags: ['site'] },
    ])
  })

  it('serializes with a trailing newline for clean commits', () => {
    runProjectsAdd(registryPath, 'vuecraft', '~/dev/vuecraft', [])
    expect(readFileSync(registryPath, 'utf8').endsWith('\n')).toBe(true)
  })

  it('appends to an existing registry without disturbing other entries', () => {
    runProjectsAdd(registryPath, 'vuecraft', '~/dev/vuecraft', ['site'])
    const result = runProjectsAdd(registryPath, 'use-viewport', '~/dev/npm/use-viewport', [
      'npm-package',
    ])
    expect(result.exitCode).toBe(0)
    expect(loadRegistry(registryPath).projects.map((p) => p.name)).toEqual([
      'vuecraft',
      'use-viewport',
    ])
  })

  it('rejects a duplicate name without touching the file', () => {
    runProjectsAdd(registryPath, 'vuecraft', '~/dev/vuecraft', [])
    const before = readFileSync(registryPath, 'utf8')
    const result = runProjectsAdd(registryPath, 'vuecraft', '~/dev/other', [])
    expect(result.exitCode).toBe(2)
    expect(result.error).toContain('already registered')
    expect(readFileSync(registryPath, 'utf8')).toBe(before)
  })
})

describe('runProjectsRemove', () => {
  it('removes a registered project', () => {
    runProjectsAdd(registryPath, 'vuecraft', '~/dev/vuecraft', [])
    const result = runProjectsRemove(registryPath, 'vuecraft')
    expect(result).toEqual({ removed: 'vuecraft', exitCode: 0, error: null })
    expect(loadRegistry(registryPath).projects).toEqual([])
  })

  it('reports an error for an unknown project without crashing', () => {
    const result = runProjectsRemove(registryPath, 'nope')
    expect(result.exitCode).toBe(2)
    expect(result.error).toContain('not registered')
  })
})

describe('runProjectsList', () => {
  it('lists all projects when the registry file does not exist yet', () => {
    const result = runProjectsList(registryPath)
    expect(result).toEqual({ projects: [], exitCode: 0 })
  })

  it('filters by tag', () => {
    runProjectsAdd(registryPath, 'vuecraft', '~/dev/vuecraft', ['site'])
    runProjectsAdd(registryPath, 'use-viewport', '~/dev/npm/use-viewport', ['npm-package'])

    expect(runProjectsList(registryPath, 'site').projects.map((p) => p.name)).toEqual(['vuecraft'])
    expect(runProjectsList(registryPath).projects).toHaveLength(2)
  })
})

describe('defaultRegistryPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('falls back to the OS-standard default with no main config', () => {
    vi.stubEnv('LINTSYNC_CONFIG', join(dir, 'does-not-exist.json'))
    expect(defaultRegistryPath()).toBe(osDefaultRegistryPath())
  })

  it("honors the main config's registryPath override", () => {
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ registryPath: '/custom/projects.json' }), 'utf8')
    vi.stubEnv('LINTSYNC_CONFIG', configPath)
    expect(defaultRegistryPath()).toBe('/custom/projects.json')
  })
})
