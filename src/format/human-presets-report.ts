import type { Preset } from '../presets/types.js'

export function renderPresetsList(presets: Preset[]): string {
  if (presets.length === 0) {
    return 'No locally-saved presets.'
  }
  return presets
    .map(
      (preset) => `${preset.name}  v${preset.version}  [${Object.keys(preset.tools).join(', ')}]`,
    )
    .join('\n')
}
