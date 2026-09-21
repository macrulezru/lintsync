import { builtinPresets } from './registry.js'
import type { Preset, PresetRegistry } from './types.js'

/**
 * Wraps the built-in registry with locally-saved presets (from the interactive `init`
 * constructor — see `commands/local-presets.ts`), so `runInit` and the interactive preset-picker
 * both resolve either kind of preset by name without caring which store it came from. Built-in
 * names always win on a clash; `addLocalPreset` already refuses to save a local preset under a
 * reserved name, so in practice this is just defense in depth, not a real resolution path.
 */
export function createPresetRegistry(localPresets: Preset[]): PresetRegistry {
  const local = new Map(localPresets.map((preset) => [preset.name, preset]))
  return {
    getPreset: (name) => builtinPresets.getPreset(name) ?? local.get(name),
  }
}
