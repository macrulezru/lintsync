import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultLocalPresetsPath,
  loadLocalPresets,
  runListLocalPresets,
  runRemoveLocalPreset,
  runSaveLocalPreset,
} from '../../commands/local-presets.js'
import { defaultPresetsPath as osDefaultPresetsPath } from '../../config/paths.js'
import type { Preset } from '../../presets/types.js'

let dir: string
let presetsPath: string

const myTeam: Preset = { name: 'my-team', version: '0.1.0', tools: {} }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lintsync-local-presets-test-'))
  presetsPath = join(dir, 'presets.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('runSaveLocalPreset', () => {
  it('creates the presets file on first save', () => {
    const result = runSaveLocalPreset(presetsPath, myTeam, [])
    expect(result).toEqual({ preset: myTeam, exitCode: 0, error: null })
    expect(loadLocalPresets(presetsPath).presets).toEqual([myTeam])
  })

  it('serializes with a trailing newline for clean commits', () => {
    runSaveLocalPreset(presetsPath, myTeam, [])
    expect(readFileSync(presetsPath, 'utf8').endsWith('\n')).toBe(true)
  })

  it('rejects a name reserved by a built-in preset without touching the file', () => {
    const result = runSaveLocalPreset(presetsPath, { ...myTeam, name: 'base' }, ['base'])
    expect(result.exitCode).toBe(2)
    expect(result.error).toContain('built-in preset name')
    expect(loadLocalPresets(presetsPath).presets).toEqual([])
  })

  it('rejects a duplicate local name without touching the file', () => {
    runSaveLocalPreset(presetsPath, myTeam, [])
    const before = readFileSync(presetsPath, 'utf8')
    const result = runSaveLocalPreset(presetsPath, { ...myTeam, version: '9.9.9' }, [])
    expect(result.exitCode).toBe(2)
    expect(readFileSync(presetsPath, 'utf8')).toBe(before)
  })
})

describe('runRemoveLocalPreset', () => {
  it('removes a saved preset', () => {
    runSaveLocalPreset(presetsPath, myTeam, [])
    const result = runRemoveLocalPreset(presetsPath, 'my-team')
    expect(result).toEqual({ removed: 'my-team', exitCode: 0, error: null })
    expect(loadLocalPresets(presetsPath).presets).toEqual([])
  })

  it('reports an error for an unknown preset without crashing', () => {
    const result = runRemoveLocalPreset(presetsPath, 'nope')
    expect(result.exitCode).toBe(2)
    expect(result.error).toContain('does not exist')
  })
})

describe('runListLocalPresets', () => {
  it('lists an empty set when the file does not exist yet', () => {
    expect(runListLocalPresets(presetsPath)).toEqual({ presets: [], exitCode: 0 })
  })

  it('lists saved presets', () => {
    runSaveLocalPreset(presetsPath, myTeam, [])
    expect(runListLocalPresets(presetsPath).presets).toEqual([myTeam])
  })
})

describe('defaultLocalPresetsPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('falls back to the OS-standard default with no main config', () => {
    vi.stubEnv('LINTSYNC_CONFIG', join(dir, 'does-not-exist.json'))
    expect(defaultLocalPresetsPath()).toBe(osDefaultPresetsPath())
  })

  it("honors the main config's presetsPath override", () => {
    const configPath = join(dir, 'config.json')
    writeFileSync(configPath, JSON.stringify({ presetsPath: '/custom/presets.json' }), 'utf8')
    vi.stubEnv('LINTSYNC_CONFIG', configPath)
    expect(defaultLocalPresetsPath()).toBe('/custom/presets.json')
  })
})
