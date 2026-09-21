import type { JsonValue } from '../merge-engine/types.js'

/**
 * One tool's slice of a preset (spec 7.1): the values it wants to own, plus which paths
 * (bracket-notation patterns, e.g. `rules.*` or `*`) it considers managed. `managedKeys` are
 * raw strings here — parsed into ConfigPath patterns by `toPresetSnapshot`.
 */
export interface PresetToolDefinition {
  rules: JsonValue
  managedKeys: string[]
}

export interface Preset {
  name: string
  version: string
  tools: Partial<Record<string, PresetToolDefinition>>
}

/** Presets are built into lintsync itself, never resolved from npm (spec section 6). */
export interface PresetRegistry {
  getPreset(name: string): Preset | undefined
}
