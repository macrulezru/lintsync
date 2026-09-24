import { describe, expect, it } from 'vitest'
import { renderPresetsList } from '../../format/human-presets-report.js'
import type { Preset } from '../../presets/types.js'

describe('renderPresetsList', () => {
  it('shows a message when there are no locally-saved presets', () => {
    expect(renderPresetsList([])).toBe('No locally-saved presets.')
  })

  it('lists name, version and tools', () => {
    const presets: Preset[] = [
      { name: 'my-team', version: '0.1.0', tools: { eslint: undefined, prettier: undefined } },
      { name: 'solo', version: '0.2.0', tools: { stylelint: undefined } },
    ]
    expect(renderPresetsList(presets)).toBe(
      'my-team  v0.1.0  [eslint, prettier]\nsolo  v0.2.0  [stylelint]',
    )
  })
})
