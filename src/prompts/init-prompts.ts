import * as clack from '@clack/prompts'

/**
 * The slice of @clack/prompts this module actually uses, as an interface — the real module
 * already matches this shape, so `realPrompts` below is just `clack` itself. Tests inject a
 * fake implementation instead of driving a real terminal, the same dependency-injection
 * pattern used for sync's TUI resolver and init's dependency installer.
 */
export interface InitPromptsApi {
  intro: typeof clack.intro
  outro: typeof clack.outro
  cancel: typeof clack.cancel
  select: typeof clack.select
  multiselect: typeof clack.multiselect
  confirm: typeof clack.confirm
  isCancel: typeof clack.isCancel
}

export const realPrompts: InitPromptsApi = clack

export interface InitChoice {
  presetName: string
  /** Present only for the "pick tools individually" path (always the `base` preset). */
  tools?: string[]
}

const CURATED_PRESET_OPTIONS = [
  {
    value: 'vue-app',
    label: 'vue-app — Vue/Nuxt application (ESLint + Prettier + Stylelint)',
  },
  {
    value: 'npm-lib',
    label: 'npm-lib — library-style npm package (ESLint + Prettier)',
  },
] as const

const TOOL_OPTIONS = [
  { value: 'eslint', label: 'ESLint' },
  { value: 'prettier', label: 'Prettier' },
  { value: 'stylelint', label: 'Stylelint' },
] as const

/**
 * The guided flow for `lintsync init` run with no `--preset` in an interactive terminal (spec
 * section 2: prompt for the missing required argument instead of erroring). Offers two paths:
 * a curated preset for a specific stack, or hand-picking tools with the generic `base` preset.
 * Returns `null` if the user cancels (Ctrl+C or Esc) at any point.
 */
export async function promptForInitChoice(
  prompts: InitPromptsApi = realPrompts,
): Promise<InitChoice | null> {
  prompts.intro('lintsync init')

  const mode = await prompts.select({
    message: 'How do you want to set up linting?',
    options: [
      { value: 'preset', label: 'Use a built-in preset for a specific stack' },
      { value: 'custom', label: 'Pick tools individually (generic defaults)' },
    ],
  })
  if (prompts.isCancel(mode)) {
    prompts.cancel('Cancelled — nothing was changed.')
    return null
  }

  if (mode === 'preset') {
    const presetName = await prompts.select({
      message: 'Which preset?',
      options: [...CURATED_PRESET_OPTIONS],
    })
    if (prompts.isCancel(presetName)) {
      prompts.cancel('Cancelled — nothing was changed.')
      return null
    }
    prompts.outro(`Setting up "${String(presetName)}"...`)
    return { presetName: String(presetName) }
  }

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
