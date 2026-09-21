import { describe, expect, it } from 'vitest'
import { buildCustomPreset } from '../../prompts/build-custom-preset.js'
import type { InitPromptsApi } from '../../prompts/init-prompts.js'
import basePreset from '../../presets/base.js'

const CANCEL = Symbol('cancel')

/** A scripted fake matching InitPromptsApi's shape, same pattern as init-prompts.test.ts's own
 *  fake — canned answers returned in call order across every prompt type, no real terminal. */
function fakePrompts(answers: unknown[]): InitPromptsApi {
  let index = 0
  const next = () => answers[index++]
  return {
    intro: () => {},
    outro: () => {},
    cancel: () => {},
    select: (async () => next()) as InitPromptsApi['select'],
    multiselect: (async () => next()) as InitPromptsApi['multiselect'],
    confirm: (async () => next()) as InitPromptsApi['confirm'],
    text: (async () => next()) as InitPromptsApi['text'],
    isCancel: (value: unknown): value is symbol => value === CANCEL,
  }
}

describe('buildCustomPreset', () => {
  it('reuses base.eslint verbatim when eslint is the only tool chosen', async () => {
    const prompts = fakePrompts([
      ['eslint'], // tools multiselect
      'my-eslint-only', // name
    ])
    const preset = await buildCustomPreset(prompts)
    expect(preset).toEqual({
      name: 'my-eslint-only',
      version: '0.1.0',
      tools: { eslint: basePreset.tools.eslint },
    })
  })

  it('builds a Prettier rules object from the per-option answers', async () => {
    const prompts = fakePrompts([
      ['prettier'], // tools multiselect
      ['semi', 'trailingComma', 'printWidth'], // which prettier options to set
      false, // semi (boolean) -> confirm
      'none', // trailingComma (choice) -> select
      '120', // printWidth (int) -> text
      'my-prettier', // name
    ])
    const preset = await buildCustomPreset(prompts)
    expect(preset?.tools.prettier).toEqual({
      configFormat: 'json',
      configFileName: '.prettierrc.json',
      dependencies: ['prettier'],
      rules: { semi: false, trailingComma: 'none', printWidth: 120 },
      managedKeys: ['*'],
    })
  })

  it('builds a Stylelint config from a chosen base config and a boolean rule', async () => {
    const prompts = fakePrompts([
      ['stylelint'], // tools multiselect
      ['stylelint-config-standard'], // base configs multiselect
      ['no-empty-source'], // which rules to set explicitly
      true, // no-empty-source (boolean) -> confirm
      'my-stylelint', // name
    ])
    const preset = await buildCustomPreset(prompts)
    expect(preset?.tools.stylelint).toEqual({
      configFormat: 'json',
      configFileName: '.stylelintrc.json',
      dependencies: ['stylelint', 'stylelint-config-standard'],
      extendsPackages: ['stylelint-config-standard'],
      rules: { 'no-empty-source': true },
      managedKeys: ['rules.*'],
    })
  })

  it('omits extendsPackages when no Stylelint base config is chosen', async () => {
    const prompts = fakePrompts([
      ['stylelint'],
      [], // no base configs selected
      [], // no rules selected
      'no-base-stylelint',
    ])
    const preset = await buildCustomPreset(prompts)
    expect(preset?.tools.stylelint).toEqual({
      configFormat: 'json',
      configFileName: '.stylelintrc.json',
      dependencies: ['stylelint'],
      rules: {},
      managedKeys: ['rules.*'],
    })
    expect(preset?.tools.stylelint).not.toHaveProperty('extendsPackages')
  })

  it('extends multiple Stylelint base configs at once (e.g. SCSS + Vue together)', async () => {
    const prompts = fakePrompts([
      ['stylelint'],
      ['stylelint-config-standard-scss', 'stylelint-config-recommended-vue'],
      [],
      'scss-vue-stylelint',
    ])
    const preset = await buildCustomPreset(prompts)
    expect(preset?.tools.stylelint).toMatchObject({
      dependencies: [
        'stylelint',
        'stylelint-config-standard-scss',
        'stylelint-config-recommended-vue',
      ],
      extendsPackages: ['stylelint-config-standard-scss', 'stylelint-config-recommended-vue'],
    })
  })

  it('builds choice/number/string Stylelint rule values and auto-adds stylelint-scss when scss/at-rule-no-unknown is on', async () => {
    const prompts = fakePrompts([
      ['stylelint'],
      [], // no base configs
      [
        'color-hex-length',
        'number-max-precision',
        'selector-class-pattern',
        'scss/at-rule-no-unknown',
      ],
      'short', // color-hex-length (choice) -> select
      '3', // number-max-precision (number) -> text
      '^[a-z]+$', // selector-class-pattern (string) -> text
      true, // scss/at-rule-no-unknown (boolean) -> confirm
      'multi-type-stylelint',
    ])
    const preset = await buildCustomPreset(prompts)
    expect(preset?.tools.stylelint).toMatchObject({
      dependencies: ['stylelint', 'stylelint-scss'],
      rules: {
        'color-hex-length': 'short',
        'number-max-precision': 3,
        'selector-class-pattern': '^[a-z]+$',
        'scss/at-rule-no-unknown': true,
      },
    })
  })

  it('returns null when the tool selection is cancelled', async () => {
    const prompts = fakePrompts([CANCEL])
    expect(await buildCustomPreset(prompts)).toBeNull()
  })

  it('returns null when the preset name prompt is cancelled', async () => {
    const prompts = fakePrompts([['eslint'], CANCEL])
    expect(await buildCustomPreset(prompts)).toBeNull()
  })

  it('returns null when a Prettier per-option answer is cancelled', async () => {
    const prompts = fakePrompts([['prettier'], ['semi'], CANCEL])
    expect(await buildCustomPreset(prompts)).toBeNull()
  })

  it('rejects a name that collides with a reserved (built-in) preset name', async () => {
    let capturedValidate: ((value: string | undefined) => string | undefined) | undefined
    const prompts: InitPromptsApi = {
      intro: () => {},
      outro: () => {},
      cancel: () => {},
      select: (async () => undefined) as InitPromptsApi['select'],
      multiselect: (async () => ['eslint']) as InitPromptsApi['multiselect'],
      confirm: (async () => undefined) as InitPromptsApi['confirm'],
      text: (async (opts) => {
        capturedValidate = opts.validate as typeof capturedValidate
        return 'base'
      }) as InitPromptsApi['text'],
      isCancel: (value: unknown): value is symbol => value === CANCEL,
    }
    await buildCustomPreset(prompts, ['base', 'vue-app', 'npm-lib'])
    expect(capturedValidate).toBeDefined()
    expect(capturedValidate?.('base')).toContain('already taken')
    expect(capturedValidate?.('a-free-name')).toBeUndefined()
    expect(capturedValidate?.('')).toContain('required')
  })
})
