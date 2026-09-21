import basePreset from './base.js'
import npmLibPreset from './npm-lib.js'
import reactAppPreset from './react-app.js'
import type { Preset, PresetRegistry } from './types.js'
import vueAppPreset from './vue-app.js'

const presets = new Map<string, Preset>([
  [vueAppPreset.name, vueAppPreset],
  [reactAppPreset.name, reactAppPreset],
  [npmLibPreset.name, npmLibPreset],
  [basePreset.name, basePreset],
])

/**
 * Registry of built-in presets (spec section 6: presets ship inside lintsync, never as separate
 * npm packages; spec 11 for the vue-app/npm-lib content; `base` is this implementation's own
 * generic, stack-agnostic addition for interactive init's "pick tools individually" path;
 * `react-app` is this implementation's own addition alongside `vue-app`, same positioning for
 * the other big framework).
 */
export const builtinPresets: PresetRegistry = {
  getPreset: (name) => presets.get(name),
}

/** Names reserved by built-in presets — a locally-saved preset can't reuse one (see
 *  `registry/local-presets.ts`'s `addLocalPreset`). */
export const builtinPresetNames: string[] = [...presets.keys()]
