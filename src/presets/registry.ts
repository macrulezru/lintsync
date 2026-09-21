import type { Preset, PresetRegistry } from './types.js'

const presets = new Map<string, Preset>()

/**
 * Registry of built-in presets (spec section 6: presets ship inside lintsync, never as separate
 * npm packages). Empty for now — the real `vue-app`/`npm-lib` preset content (spec section 11)
 * lands with `init` (spec 12.2 stage 9). Until then this honestly reflects that lintsync has no
 * built-in presets yet: `sync` correctly reports "preset not found" for any manifest that names
 * one, rather than pretending to have content that doesn't exist.
 */
export const builtinPresets: PresetRegistry = {
  getPreset: (name) => presets.get(name),
}
