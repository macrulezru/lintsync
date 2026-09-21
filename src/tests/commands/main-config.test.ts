import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadMainConfig } from '../../commands/main-config.js'
import { defaultMainConfigPath } from '../../config/paths.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lintsync-main-config-test-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('loadMainConfig', () => {
  it('returns an empty object when the file does not exist', () => {
    expect(loadMainConfig(join(dir, 'does-not-exist.json'))).toEqual({})
  })

  it('returns an empty object for invalid JSON instead of throwing', () => {
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, 'not json', 'utf8')
    expect(loadMainConfig(configPath)).toEqual({})
  })

  it('parses a valid config file', () => {
    const configPath = join(dir, 'config.json')
    writeFileSync(
      configPath,
      JSON.stringify({
        presetsPath: '/custom/presets.json',
        registryPath: '/custom/projects.json',
      }),
      'utf8',
    )
    expect(loadMainConfig(configPath)).toEqual({
      presetsPath: '/custom/presets.json',
      registryPath: '/custom/projects.json',
    })
  })

  it('defaults to resolveMainConfigPath() (LINTSYNC_CONFIG, else the OS default) when called with no argument', () => {
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ presetsPath: '/via-env/presets.json' }), 'utf8')
    vi.stubEnv('LINTSYNC_CONFIG', configPath)
    expect(loadMainConfig()).toEqual({ presetsPath: '/via-env/presets.json' })
  })

  it('is a no-op against the real OS default path when no override is set (sanity check)', () => {
    vi.stubEnv('LINTSYNC_CONFIG', '')
    // Just confirms this doesn't throw and returns an object shape, without asserting on
    // whatever the real machine's default config file happens to contain (if anything).
    expect(typeof loadMainConfig()).toBe('object')
    expect(defaultMainConfigPath().length).toBeGreaterThan(0)
  })
})
