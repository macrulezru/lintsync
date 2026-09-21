import { dirname } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  defaultConfigDir,
  defaultMainConfigPath,
  defaultPresetsPath,
  defaultRegistryPath,
  resolveMainConfigPath,
} from '../../config/paths.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('OS-standard default paths', () => {
  it('places the main config, registry, and presets files in the same config directory', () => {
    const dir = defaultConfigDir()
    expect(dirname(defaultMainConfigPath())).toBe(dir)
    expect(dirname(defaultRegistryPath())).toBe(dir)
    expect(dirname(defaultPresetsPath())).toBe(dir)
  })

  it('uses the conventional filenames', () => {
    expect(defaultMainConfigPath().endsWith('config.json')).toBe(true)
    expect(defaultRegistryPath().endsWith('projects.json')).toBe(true)
    expect(defaultPresetsPath().endsWith('presets.json')).toBe(true)
  })

  it("the config directory is scoped to lintsync's own name", () => {
    expect(defaultConfigDir().toLowerCase()).toContain('lintsync')
  })
})

describe('resolveMainConfigPath', () => {
  it('falls back to the OS-standard default when LINTSYNC_CONFIG is unset', () => {
    vi.stubEnv('LINTSYNC_CONFIG', '')
    expect(resolveMainConfigPath()).toBe(defaultMainConfigPath())
  })

  it('honors LINTSYNC_CONFIG when set', () => {
    vi.stubEnv('LINTSYNC_CONFIG', '/custom/path/config.json')
    expect(resolveMainConfigPath()).toBe('/custom/path/config.json')
  })
})
