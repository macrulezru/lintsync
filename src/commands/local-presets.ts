import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { defaultPresetsPath as osDefaultPresetsPath } from '../config/paths.js'
import {
  addLocalPreset,
  listLocalPresets,
  parseLocalPresets,
  removeLocalPreset,
  serializeLocalPresets,
} from '../registry/local-presets.js'
import type { LocalPresetsFile } from '../registry/types.js'
import type { Preset } from '../presets/types.js'
import { loadMainConfig } from './main-config.js'

/** Default location for locally-built presets: the main config's own `presetsPath` if it sets
 *  one, else the OS-standard config directory (`config/paths.ts`) — one global, per-machine
 *  store, not per-project. */
export function defaultLocalPresetsPath(): string {
  return loadMainConfig().presetsPath ?? osDefaultPresetsPath()
}

export function loadLocalPresets(presetsPath: string): LocalPresetsFile {
  try {
    return parseLocalPresets(readFileSync(presetsPath, 'utf8'))
  } catch {
    return { presets: [] }
  }
}

function saveLocalPresets(presetsPath: string, file: LocalPresetsFile): void {
  mkdirSync(dirname(presetsPath), { recursive: true })
  writeFileSync(presetsPath, serializeLocalPresets(file), 'utf8')
}

export interface SaveLocalPresetResult {
  preset: Preset | null
  exitCode: number
  error: string | null
}

export function runSaveLocalPreset(
  presetsPath: string,
  preset: Preset,
  reservedNames: readonly string[],
): SaveLocalPresetResult {
  const file = loadLocalPresets(presetsPath)
  const result = addLocalPreset(file, preset, reservedNames)
  if ('error' in result) {
    return { preset: null, exitCode: 2, error: result.error }
  }
  saveLocalPresets(presetsPath, result)
  return { preset, exitCode: 0, error: null }
}

export interface RemoveLocalPresetResult {
  removed: string | null
  exitCode: number
  error: string | null
}

export function runRemoveLocalPreset(presetsPath: string, name: string): RemoveLocalPresetResult {
  const file = loadLocalPresets(presetsPath)
  const result = removeLocalPreset(file, name)
  if ('error' in result) {
    return { removed: null, exitCode: 2, error: result.error }
  }
  saveLocalPresets(presetsPath, result)
  return { removed: name, exitCode: 0, error: null }
}

export interface ListLocalPresetsResult {
  presets: Preset[]
  exitCode: number
}

export function runListLocalPresets(presetsPath: string): ListLocalPresetsResult {
  const file = loadLocalPresets(presetsPath)
  return { presets: listLocalPresets(file), exitCode: 0 }
}
