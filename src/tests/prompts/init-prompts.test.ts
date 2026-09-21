import { describe, expect, it } from 'vitest'
import {
  promptConfirmOverwrite,
  promptForInitChoice,
  type InitPromptsApi,
} from '../../prompts/init-prompts.js'

const CANCEL = Symbol('cancel')

/** A scripted fake matching InitPromptsApi's shape — no real terminal involved, just canned
 *  answers returned in call order, mirroring how sync's TUI resolver is faked in its tests. */
function fakePrompts(answers: unknown[]): InitPromptsApi & { messages: string[] } {
  const messages: string[] = []
  let index = 0
  const next = () => answers[index++]
  return {
    messages,
    intro: (message: string) => {
      messages.push(`intro:${message}`)
    },
    outro: (message: string) => {
      messages.push(`outro:${message}`)
    },
    cancel: (message?: string) => {
      messages.push(`cancel:${message ?? ''}`)
    },
    select: (async () => next()) as InitPromptsApi['select'],
    multiselect: (async () => next()) as InitPromptsApi['multiselect'],
    confirm: (async () => next()) as InitPromptsApi['confirm'],
    isCancel: (value: unknown): value is symbol => value === CANCEL,
  }
}

describe('promptForInitChoice', () => {
  it('returns the chosen curated preset', async () => {
    const prompts = fakePrompts(['preset', 'vue-app'])
    const choice = await promptForInitChoice(prompts)
    expect(choice).toEqual({ presetName: 'vue-app' })
    expect(prompts.messages[0]).toContain('intro')
    expect(prompts.messages.at(-1)).toContain('outro')
  })

  it('returns the base preset with the selected tools for the custom path', async () => {
    const prompts = fakePrompts(['custom', ['eslint', 'stylelint']])
    const choice = await promptForInitChoice(prompts)
    expect(choice).toEqual({ presetName: 'base', tools: ['eslint', 'stylelint'] })
  })

  it('returns null when the mode selection is cancelled', async () => {
    const prompts = fakePrompts([CANCEL])
    const choice = await promptForInitChoice(prompts)
    expect(choice).toBeNull()
    expect(prompts.messages.some((m) => m.startsWith('cancel:'))).toBe(true)
  })

  it('returns null when the preset selection is cancelled', async () => {
    const prompts = fakePrompts(['preset', CANCEL])
    const choice = await promptForInitChoice(prompts)
    expect(choice).toBeNull()
  })

  it('returns null when the tool multiselect is cancelled', async () => {
    const prompts = fakePrompts(['custom', CANCEL])
    const choice = await promptForInitChoice(prompts)
    expect(choice).toBeNull()
  })
})

describe('promptConfirmOverwrite', () => {
  it('returns the confirmed boolean', async () => {
    const prompts = fakePrompts([true])
    expect(await promptConfirmOverwrite('eslint', 'eslint.config.js', prompts)).toBe(true)
  })

  it('returns false when cancelled', async () => {
    const prompts = fakePrompts([CANCEL])
    expect(await promptConfirmOverwrite('eslint', 'eslint.config.js', prompts)).toBe(false)
  })
})
