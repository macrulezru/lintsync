import { builtinPresetNames } from '../presets/registry.js'
import type { Preset } from '../presets/types.js'
import { buildCustomPreset } from './build-custom-preset.js'
import { realPrompts, TOOL_OPTIONS, type InitPromptsApi } from './prompts-api.js'

export type { InitPromptsApi } from './prompts-api.js'
export { realPrompts, TOOL_OPTIONS } from './prompts-api.js'

export interface InitChoice {
  presetName: string
  /** Present only for the "pick tools individually" path (always the `base` preset). */
  tools?: string[]
  /** Present only for the "build a new custom preset" path — the caller (cli.ts) still needs to
   *  persist this via `commands/local-presets.ts` before `presetName` resolves anywhere. */
  newPreset?: Preset
}

const CURATED_PRESET_OPTIONS = [
  {
    value: 'vue-app',
    label: 'vue-app — Vue/Nuxt application (ESLint + Prettier + Stylelint)',
  },
  {
    value: 'react-app',
    label: 'react-app — React application (ESLint + Prettier + Stylelint)',
  },
  {
    value: 'npm-lib',
    label: 'npm-lib — library-style npm package (ESLint + Prettier)',
  },
] as const

/**
 * The guided flow for `lintsync init` run with no `--preset` in an interactive terminal (spec
 * section 2: prompt for the missing required argument instead of erroring). Offers three paths:
 * a curated or previously-saved preset, hand-picking tools with the generic `base` preset, or
 * building a brand-new preset from scratch via `buildCustomPreset`'s Prettier/Stylelint
 * constructor. Returns `null` if the user cancels (Ctrl+C or Esc) at any point.
 */
export async function promptForInitChoice(
  prompts: InitPromptsApi = realPrompts,
  localPresets: Preset[] = [],
): Promise<InitChoice | null> {
  prompts.intro('lintsync init')

  const mode = await prompts.select({
    message: 'How do you want to set up linting?',
    options: [
      { value: 'preset', label: 'Use a built-in or saved preset' },
      { value: 'individual', label: 'Pick tools individually (generic defaults)' },
      {
        value: 'build',
        label: 'Build and save a new custom preset (Prettier/Stylelint constructor)',
      },
    ],
  })
  if (prompts.isCancel(mode)) {
    prompts.cancel('Cancelled — nothing was changed.')
    return null
  }

  if (mode === 'preset') {
    const presetName = await prompts.select({
      message: 'Which preset?',
      options: [
        ...CURATED_PRESET_OPTIONS,
        ...localPresets.map((preset) => ({
          value: preset.name,
          label: `${preset.name} — locally saved preset`,
        })),
      ],
    })
    if (prompts.isCancel(presetName)) {
      prompts.cancel('Cancelled — nothing was changed.')
      return null
    }
    prompts.outro(`Setting up "${String(presetName)}"...`)
    return { presetName: String(presetName) }
  }

  if (mode === 'individual') {
    const tools = await prompts.multiselect({
      message: 'Which tools do you want to set up?',
      options: [...TOOL_OPTIONS],
      required: true,
    })
    if (prompts.isCancel(tools)) {
      prompts.cancel('Cancelled — nothing was changed.')
      return null
    }
    prompts.outro('Setting up with generic defaults...')
    return { presetName: 'base', tools: tools as string[] }
  }

  const reservedNames = [...builtinPresetNames, ...localPresets.map((preset) => preset.name)]
  const newPreset = await buildCustomPreset(prompts, reservedNames)
  if (!newPreset) {
    prompts.cancel('Cancelled — nothing was changed.')
    return null
  }
  prompts.outro(`Saved "${newPreset.name}" — setting it up now...`)
  return { presetName: newPreset.name, newPreset }
}

/** Interactive `init`'s answer to an already-existing config file (spec section 2's "ask
 *  instead of requiring a flag" for the interactive path); non-interactive runs keep skipping. */
export async function promptConfirmOverwrite(
  tool: string,
  existingPath: string,
  prompts: InitPromptsApi = realPrompts,
): Promise<boolean> {
  const answer = await prompts.confirm({
    message: `${tool}: config already exists at ${existingPath}. Overwrite it?`,
    initialValue: false,
  })
  if (prompts.isCancel(answer)) {
    return false
  }
  return answer
}
