import { getPrettierOptions, type PrettierOptionInfo } from '../introspect/prettier-options.js'
import {
  STYLELINT_BASE_CONFIGS,
  STYLELINT_RULES,
  type StylelintRuleInfo,
} from '../introspect/stylelint-known-values.js'
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

/**
 * Mirrors buildPrettierRules' per-type interaction (confirm for boolean, select for choice, text
 * for number/string) — the same UX, just driven by the hand-curated STYLELINT_RULES catalog
 * instead of a live API. A boolean rule's "off" answer writes `null` (Stylelint's own way to
 * disable a rule a base config already turned on) rather than being left unset, since the whole
 * point of touching a boolean rule here is to make an explicit choice about it either way.
 */
async function buildStylelintRuleValues(
  prompts: InitPromptsApi,
  rules: StylelintRuleInfo[],
): Promise<Record<string, JsonValue> | null> {
  const selected = await prompts.multiselect({
    message: 'Stylelint: which rules do you want to set explicitly?',
    options: rules.map((rule) => ({ value: rule.name, label: rule.name, hint: rule.description })),
    required: false,
  })
  if (prompts.isCancel(selected)) {
    return null
  }

  const result: Record<string, JsonValue> = {}
  for (const name of selected as string[]) {
    const rule = rules.find((candidate) => candidate.name === name)
    if (!rule) {
      continue
    }

    if (rule.type === 'boolean') {
      const on = await prompts.confirm({
        message: `${rule.name}: ${rule.description}`,
        initialValue: Boolean(rule.recommended),
      })
      if (prompts.isCancel(on)) {
        return null
      }
      result[rule.name] = on ? true : null
    } else if (rule.type === 'choice' && rule.choices) {
      const value = await prompts.select({
        message: `${rule.name}: ${rule.description}`,
        options: rule.choices.map((choice) => ({ value: choice.value, label: choice.value })),
      })
      if (prompts.isCancel(value)) {
        return null
      }
      result[rule.name] = String(value)
    } else {
      const value = await prompts.text({
        message: `${rule.name}: ${rule.description}`,
        placeholder: String(rule.recommended),
      })
      if (prompts.isCancel(value)) {
        return null
      }
      result[rule.name] = rule.type === 'number' ? Number(value) : value
    }
  }
  return result
}

interface StylelintBuildResult {
  rules: Record<string, JsonValue>
  extendsPackages: string[]
  dependencies: string[]
}

async function buildStylelintConfig(prompts: InitPromptsApi): Promise<StylelintBuildResult | null> {
  const baseChoices = await prompts.multiselect({
    message: 'Stylelint: extend base config(s)? (pick as many as apply, e.g. SCSS + Vue together)',
    options: STYLELINT_BASE_CONFIGS.map((config) => ({
      value: config.package,
      label: config.package,
      hint: config.description,
    })),
    required: false,
  })
  if (prompts.isCancel(baseChoices)) {
    return null
  }
  const extendsPackages = baseChoices as string[]

  const rules = await buildStylelintRuleValues(prompts, STYLELINT_RULES)
  if (rules === null) {
    return null
  }

  const dependencySet = new Set(['stylelint', ...extendsPackages])
  if ('scss/at-rule-no-unknown' in rules && rules['scss/at-rule-no-unknown'] === true) {
    dependencySet.add('stylelint-scss')
  }

  return { rules, extendsPackages, dependencies: [...dependencySet] }
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
