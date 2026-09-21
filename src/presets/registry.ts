import npmLibPreset from './npm-lib.js'
import type { Preset, PresetRegistry } from './types.js'
import vueAppPreset from './vue-app.js'

const presets = new Map<string, Preset>([
  [vueAppPreset.name, vueAppPreset],
  [npmLibPreset.name, npmLibPreset],
])

/**
 * Registry of built-in presets (spec section 6: presets ship inside lintsync, never as separate
 * npm packages; spec 11 for the vue-app/npm-lib content itself).
 */
export const builtinPresets: PresetRegistry = {
  getPreset: (name) => presets.get(name),
}
