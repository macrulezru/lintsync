import type { Preset } from '../presets/types.js'
import type { LocalPresetsFile } from './types.js'

export function parseLocalPresets(text: string): LocalPresetsFile {
  return JSON.parse(text) as LocalPresetsFile
}

export function serializeLocalPresets(file: LocalPresetsFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

export interface LocalPresetsError {
  error: string
}

/**
 * Adds a locally-built preset, keyed by name like the project registry. `reservedNames` is the
 * built-in preset registry's own names (`vue-app`, `npm-lib`, `base`) — a local preset can't
 * shadow one of those, since preset selection (interactive or `--preset`) resolves by name alone
 * with no way to say which registry a name came from.
 */
export function addLocalPreset(
  file: LocalPresetsFile,
  preset: Preset,
  reservedNames: readonly string[] = [],
): LocalPresetsFile | LocalPresetsError {
  if (reservedNames.includes(preset.name)) {
    return { error: `"${preset.name}" is a built-in preset name and can't be reused` }
  }
  if (file.presets.some((existing) => existing.name === preset.name)) {
    return { error: `A local preset named "${preset.name}" already exists` }
  }
  return { presets: [...file.presets, preset] }
}

export function removeLocalPreset(
  file: LocalPresetsFile,
  name: string,
): LocalPresetsFile | LocalPresetsError {
  if (!file.presets.some((preset) => preset.name === name)) {
    return { error: `Local preset "${name}" does not exist` }
  }
  return { presets: file.presets.filter((preset) => preset.name !== name) }
}

export function listLocalPresets(file: LocalPresetsFile): Preset[] {
  return file.presets
}
