import { getPrettierOptions, type PrettierOptionInfo } from '../introspect/prettier-options.js'
import { STYLELINT_BASE_CONFIGS, STYLELINT_RULES } from '../introspect/stylelint-known-values.js'
import type { JsonValue } from '../merge-engine/types.js'
import basePreset from '../presets/base.js'
import type { Preset, PresetToolDefinition } from '../presets/types.js'
import { realPrompts, TOOL_OPTIONS, type InitPromptsApi } from './prompts-api.js'

async function buildPrettierRules(
  prompts: InitPromptsApi,
  options: PrettierOptionInfo[],
): Promise<Record<string, JsonValue> | null> {
  const selected = await prompts.multiselect({
    message:
      "Prettier: which options do you want to set? (unselected options keep Prettier's own default)",
    options: options.map((option) => ({
      value: option.name,
      label: option.name,
      hint: option.description,
    })),
    required: false,
  })
  if (prompts.isCancel(selected)) {
    return null
  }

  const rules: Record<string, JsonValue> = {}
  for (const name of selected as string[]) {
    const option = options.find((candidate) => candidate.name === name)
    if (!option) {
      continue
    }

    if (option.type === 'boolean') {
      const value = await prompts.confirm({
        message: `${option.name}: ${option.description}`,
        initialValue: Boolean(option.default),
      })
      if (prompts.isCancel(value)) {
        return null
      }
      rules[option.name] = value
    } else if (option.type === 'choice' && option.choices) {
      const value = await prompts.select({
        message: `${option.name}: ${option.description}`,
        options: option.choices.map((choice) => ({
          value: choice.value,
          label: choice.value,
          hint: choice.description,
        })),
      })
      if (prompts.isCancel(value)) {
        return null
      }
      rules[option.name] = String(value)
    } else {
      const value = await prompts.text({
        message: `${option.name}: ${option.description}`,
        ...(option.default !== undefined ? { placeholder: String(option.default) } : {}),
      })
      if (prompts.isCancel(value)) {
        return null
      }
      rules[option.name] = option.type === 'int' ? Number(value) : value
    }
  }
  return rules
}

interface StylelintBuildResult {
  rules: Record<string, JsonValue>
  extendsPackages: string[]
  dependencies: string[]
}

async function buildStylelintConfig(prompts: InitPromptsApi): Promise<StylelintBuildResult | null> {
  const baseChoice = await prompts.select({
    message: 'Stylelint: extend a base config?',
    options: [
      { value: 'none', label: 'None — start from an empty config' },
      ...STYLELINT_BASE_CONFIGS.map((config) => ({
        value: config.package,
        label: config.package,
        hint: config.description,
      })),
    ],
  })
  if (prompts.isCancel(baseChoice)) {
    return null
  }
  const extendsPackages = baseChoice === 'none' ? [] : [String(baseChoice)]

  const toggled = await prompts.multiselect({
    message: 'Stylelint: which rules do you want to set explicitly?',
    options: STYLELINT_RULES.map((rule) => ({
      value: rule.name,
      label: rule.name,
      hint: rule.description,
    })),
    required: false,
  })
  if (prompts.isCancel(toggled)) {
    return null
  }

  const rules: Record<string, JsonValue> = {}
  for (const name of toggled as string[]) {
    const rule = STYLELINT_RULES.find((candidate) => candidate.name === name)
    if (!rule) {
      continue
    }
    const on = await prompts.confirm({ message: `${name}: turn this rule on?`, initialValue: true })
    if (prompts.isCancel(on)) {
      return null
    }
    rules[name] = on ? rule.onValue : rule.offValue
  }

  return { rules, extendsPackages, dependencies: ['stylelint', ...extendsPackages] }
}

async function promptPresetName(
  prompts: InitPromptsApi,
  reservedNames: readonly string[],
): Promise<string | null> {
  const name = await prompts.text({
    message: 'Name this preset (it will appear in the preset picker from now on):',
    validate: (value) => {
      const trimmed = (value ?? '').trim()
      if (trimmed.length === 0) {
        return 'A name is required'
      }
      if (reservedNames.includes(trimmed)) {
        return `"${trimmed}" is already taken`
      }
      return undefined
    },
  })
  if (prompts.isCancel(name)) {
    return null
  }
  return name.trim()
}

/**
 * The interactive "build your own preset" flow (confirmed with the user): a per-tool constructor
 * for Prettier/Stylelint driven by their actual live option data (`getPrettierOptions` — an
 * official Prettier API; `STYLELINT_RULES` — hand-curated, since Stylelint has no equivalent
 * API), with ESLint kept out of that per-rule treatment and instead reused verbatim from `base`
 * when the user opts to include it at all. Returns `null` if the user cancels at any step;
 * otherwise an unsaved `Preset`, still needing a name (also collected here) before
 * `commands/local-presets.ts` can persist it.
 */
export async function buildCustomPreset(
  prompts: InitPromptsApi = realPrompts,
  reservedNames: readonly string[] = [],
): Promise<Preset | null> {
  const tools = await prompts.multiselect({
    message: 'Which tools do you want in this custom preset?',
    options: [...TOOL_OPTIONS],
    required: true,
  })
  if (prompts.isCancel(tools)) {
    return null
  }
  const toolNames = tools as string[]

  const presetTools: Partial<Record<string, PresetToolDefinition>> = {}

  if (toolNames.includes('eslint') && basePreset.tools.eslint) {
    presetTools.eslint = basePreset.tools.eslint
  }

  if (toolNames.includes('prettier')) {
    const prettierOptions = await getPrettierOptions()
    const rules = await buildPrettierRules(prompts, prettierOptions)
    if (rules === null) {
      return null
    }
    presetTools.prettier = {
      configFormat: 'json',
      configFileName: '.prettierrc.json',
      dependencies: ['prettier'],
      rules,
      managedKeys: ['*'],
    }
  }

  if (toolNames.includes('stylelint')) {
    const result = await buildStylelintConfig(prompts)
    if (result === null) {
      return null
    }
    presetTools.stylelint = {
      configFormat: 'json',
      configFileName: '.stylelintrc.json',
      dependencies: result.dependencies,
      ...(result.extendsPackages.length > 0 ? { extendsPackages: result.extendsPackages } : {}),
      rules: result.rules,
      managedKeys: ['rules.*'],
    }
  }

  const name = await promptPresetName(prompts, reservedNames)
  if (name === null) {
    return null
  }

  return { name, version: '0.1.0', tools: presetTools }
}
