import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import { ConflictResolver } from '../../tui/ConflictResolver.js'
import type { ConflictItem, Resolution } from '../../tui/types.js'

const UP = '\u001B[A'
const DOWN = '\u001B[B'
const LEFT = '\u001B[D'
const RIGHT = '\u001B[C'
const ENTER = '\r'
const ESCAPE = '\u001B'
const BACKSPACE = '\u007F'

const conflicts: ConflictItem[] = [
  { path: ['rules', 'no-console'], fileValue: 'error', manifestValue: 'off', presetValue: 'warn' },
  {
    path: ['rules', 'vue/multi-word-component-names'],
    fileValue: 'warn',
    manifestValue: 'off',
    presetValue: 'off',
  },
  { path: ['printWidth'], fileValue: 120, manifestValue: 100, presetValue: 100 },
]

/** ink applies input asynchronously; a macrotask tick is enough for the frame to settle. */
async function press(instance: ReturnType<typeof render>, ...keys: string[]): Promise<void> {
  for (const key of keys) {
    instance.stdin.write(key)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function setup() {
  let result: Resolution[] | undefined
  const instance = render(
    <ConflictResolver
      conflicts={conflicts}
      onComplete={(resolutions) => {
        result = resolutions
      }}
    />,
  )
  return { instance, getResult: () => result }
}

describe('ConflictResolver', () => {
  it('renders the 3-way diff and options for the first conflict on mount', () => {
    const { instance } = setup()
    const frame = instance.lastFrame()
    expect(frame).toContain('Конфликт 1/3')
    expect(frame).toContain('rules.no-console')
    expect(frame).toContain('Локально: "error"')
    expect(frame).toContain('Манифест (было): "off"')
    expect(frame).toContain('Эталон (стало): "warn"')
    expect(frame).toContain('Принять эталон')
    expect(frame).toContain('Оставить локальное')
    expect(frame).toContain('Отредактировать вручную')
  })

  it('shows a live preview that follows the option cursor before confirming', () => {
    const { instance } = setup()
    // cursor starts on 'accept-preset' (index 0) -> previews the preset's value
    expect(instance.lastFrame()).toContain('Предпросмотр: "warn"')
  })

  it('paginates between conflicts with left/right arrows without requiring a resolution first', async () => {
    const { instance } = setup()
    await press(instance, RIGHT)
    expect(instance.lastFrame()).toContain('Конфликт 2/3')
    expect(instance.lastFrame()).toContain('vue/multi-word-component-names')

    await press(instance, RIGHT)
    expect(instance.lastFrame()).toContain('Конфликт 3/3')

    // right arrow at the last page is clamped, not wrapped
    await press(instance, RIGHT)
    expect(instance.lastFrame()).toContain('Конфликт 3/3')

    await press(instance, LEFT, LEFT)
    expect(instance.lastFrame()).toContain('Конфликт 1/3')
  })

  it('moves the option cursor with up/down and previews the highlighted choice', async () => {
    const { instance } = setup()
    await press(instance, DOWN) // now on 'keep-local' -> previews the file's current value
    expect(instance.lastFrame()).toContain('Предпросмотр: "error"')

    await press(instance, UP) // back to 'accept-preset'
    expect(instance.lastFrame()).toContain('Предпросмотр: "warn"')
  })

  it('confirms accept-preset with Enter and advances to the next unresolved page', async () => {
    const { instance } = setup()
    await press(instance, ENTER) // cursor starts on 'Принять эталон'
    expect(instance.lastFrame()).toContain('Конфликт 2/3')
  })

  it('calls onComplete with all resolutions once every conflict has one', async () => {
    const { instance, getResult } = setup()
    await press(instance, ENTER) // conflict 1 -> accept-preset ('warn')
    await press(instance, ENTER) // conflict 2 -> accept-preset ('off')
    await press(instance, ENTER) // conflict 3 -> accept-preset (100)

    expect(getResult()).toEqual([
      { path: ['rules', 'no-console'], choice: 'accept-preset', value: 'warn' },
      { path: ['rules', 'vue/multi-word-component-names'], choice: 'accept-preset', value: 'off' },
      { path: ['printWidth'], choice: 'accept-preset', value: 100 },
    ])
  })

  it('supports keep-local as a resolution', async () => {
    const { instance, getResult } = setup()
    await press(instance, DOWN, ENTER) // conflict 1 -> keep-local
    await press(instance, DOWN, ENTER) // conflict 2 -> keep-local
    await press(instance, DOWN, ENTER) // conflict 3 -> keep-local

    expect(getResult()).toEqual([
      { path: ['rules', 'no-console'], choice: 'keep-local', value: 'error' },
      { path: ['rules', 'vue/multi-word-component-names'], choice: 'keep-local', value: 'warn' },
      { path: ['printWidth'], choice: 'keep-local', value: 120 },
    ])
  })

  it('enters manual-edit mode, previews the typed value live, and commits it on Enter', async () => {
    const { instance, getResult } = setup()
    await press(instance, DOWN, DOWN) // now on 'Отредактировать вручную'
    await press(instance, ENTER) // enters manual mode, prefilled with current fileValue
    expect(instance.lastFrame()).toContain('Ввод:')
    expect(instance.lastFrame()).toContain('"error"')

    // clear the prefilled input ("error" = 7 chars) and type a new JSON value
    await press(instance, ...Array<string>(7).fill(BACKSPACE))
    await press(instance, ...'"silent"'.split(''))
    expect(instance.lastFrame()).toContain('Ввод: "silent"')

    await press(instance, ENTER)
    expect(instance.lastFrame()).toContain('Конфликт 2/3')
    // finish the rest so onComplete fires and we can inspect the recorded value
    await press(instance, ENTER, ENTER)
    expect(getResult()?.[0]).toEqual({
      path: ['rules', 'no-console'],
      choice: 'manual',
      value: 'silent',
    })
  })

  it('escape exits manual-edit mode without recording a resolution', async () => {
    const { instance } = setup()
    await press(instance, DOWN, DOWN, ENTER) // manual mode
    await press(instance, 'x')
    await press(instance, ESCAPE)
    // still on the same conflict, not advanced, and back to the normal option view
    expect(instance.lastFrame()).toContain('Конфликт 1/3')
    expect(instance.lastFrame()).toContain('Отредактировать вручную')
  })

  it('re-visiting an already-resolved page shows a checkmark on its recorded choice', async () => {
    const { instance } = setup()
    await press(instance, ENTER) // conflict 1 -> accept-preset, advances to conflict 2
    await press(instance, LEFT) // back to conflict 1
    expect(instance.lastFrame()).toContain('Принять эталон ✓')
  })
})
