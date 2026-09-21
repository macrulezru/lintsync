import { getSupportInfo, type SupportOption } from 'prettier'
import type { JsonValue } from '../merge-engine/types.js'

export type PrettierOptionType = 'boolean' | 'choice' | 'int' | 'string'

export interface PrettierOptionChoice {
  value: string
  description: string
}

export interface PrettierOptionInfo {
  name: string
  type: PrettierOptionType
  default: JsonValue | undefined
  description: string
  choices?: PrettierOptionChoice[]
}

/**
 * Options `getSupportInfo()` reports that don't belong in a `.prettierrc` — not formatting
 * choices at all, but "which file/parser/plugin to run on" (`filepath`, `plugins`, `parser`) or
 * "which part of one specific invocation to format" (`cursorOffset`, `rangeStart`, `rangeEnd`),
 * neither of which makes sense as a static, shared preset value. This filtering is this
 * implementation's own judgment call, not something Prettier itself flags — Prettier's own
 * `category: 'Special'` grouping is broader than this list (it also covers `insertPragma`/
 * `requirePragma`/`checkIgnorePragma`, which genuinely are ordinary, if niche, config-file
 * options and are deliberately kept in the constructor rather than excluded here).
 */
const EXCLUDED_OPTION_NAMES = new Set([
  'filepath',
  'plugins',
  'parser',
  'cursorOffset',
  'rangeStart',
  'rangeEnd',
])

function toChoices(option: SupportOption): PrettierOptionChoice[] | undefined {
  if (option.type !== 'choice') {
    return undefined
  }
  return option.choices.map((choice) => ({
    value: String(choice.value),
    description: choice.description,
  }))
}

/**
 * The live, official source for "what can Prettier's config actually contain, and what are the
 * valid values" — no hand-maintained list, no network sync: `prettier.getSupportInfo()` is
 * Prettier's own API for this, called against whatever version lintsync bundles (see stylelint's
 * lack of an equivalent API, which is why its interactive builder is curated by hand instead).
 * Excludes array-type options (Prettier's own plugin/parser-loading concerns, not something a
 * project's config normally sets per-key) and the CLI-only options above.
 */
export async function getPrettierOptions(): Promise<PrettierOptionInfo[]> {
  const info = await getSupportInfo()
  const options: PrettierOptionInfo[] = []
  for (const option of info.options) {
    const isArrayOption = 'array' in option && option.array
    if (!option.name || EXCLUDED_OPTION_NAMES.has(option.name) || isArrayOption) {
      continue
    }
    if (option.type === 'path') {
      continue
    }
    const choices = toChoices(option)
    options.push({
      name: option.name,
      type: option.type,
      default: option.default as JsonValue | undefined,
      description: option.description ?? '',
      ...(choices ? { choices } : {}),
    })
  }
  return options
}
