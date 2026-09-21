import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stringify as stringifyYaml } from 'yaml'
import { literalToSourceText, toPropertyName } from '../merge-engine/js-adapter.js'
import type { JsonValue } from '../merge-engine/types.js'
import { pickAdapter } from './pick-adapter.js'

/** Conventional legacy filenames `migrate` looks for per tool, checked in this order. Files
 *  with no extension (bare `.eslintrc`, `.prettierrc`) are a known gap — format there is only
 *  decidable by sniffing content (JSON vs YAML), which migrate does not attempt (spec 4.4
 *  leaves migrate's exact scope open; this keeps it to the unambiguous, extension-based case). */
const LEGACY_FILENAMES: Record<string, string[]> = {
  eslint: ['.eslintrc.json', '.eslintrc.yaml', '.eslintrc.yml', '.eslintrc.js', '.eslintrc.cjs'],
  prettier: [
    '.prettierrc.json',
    '.prettierrc.yaml',
    '.prettierrc.yml',
    '.prettierrc.js',
    '.prettierrc.cjs',
    'prettier.config.js',
  ],
  stylelint: ['.stylelintrc.json', '.stylelintrc.yaml', '.stylelintrc.yml', '.stylelintrc.js'],
}

/** Target filename per tool + `--to` format (spec 4.4/8: `migrate <tool> --to <format>`). */
const TARGET_FILENAMES: Record<string, Record<string, string>> = {
  eslint: { flat: 'eslint.config.mjs' },
  prettier: { json: '.prettierrc.json', yaml: '.prettierrc.yaml', js: '.prettierrc.js' },
  stylelint: { json: '.stylelintrc.json', yaml: '.stylelintrc.yaml', js: '.stylelintrc.js' },
}

/**
 * ESLint keys whose meaning is unchanged between the legacy eslintrc schema and flat config's
 * per-object shape — `rules` is genuinely the same {ruleName: severity|[severity, ...options]}
 * structure in both. Everything else (`extends`, `plugins`, `env`, `parserOptions`, `globals`,
 * `overrides`, `parser`...) has real semantic differences in flat config (array-spread base
 * configs, `languageOptions`, per-file `overrides` become separate array entries, etc.) that a
 * mechanical rename would likely get subtly wrong — spec 4.4 explicitly asks for a report of
 * what needs manual review instead of guessing, matching 7.4.3's own "never guess" philosophy.
 */
const ESLINT_SAFE_KEYS = new Set(['rules'])

export interface MigrateReport {
  tool: string
  fromPath: string | null
  toPath: string | null
  migratedKeys: string[]
  needsManualReview: string[]
  exitCode: number
  error: string | null
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function errorReport(tool: string, message: string): MigrateReport {
  return {
    tool,
    fromPath: null,
    toPath: null,
    migratedKeys: [],
    needsManualReview: [],
    exitCode: 2,
    error: message,
  }
}

function findLegacyFile(cwd: string, tool: string): string | undefined {
  for (const name of LEGACY_FILENAMES[tool] ?? []) {
    if (existsSync(join(cwd, name))) {
      return name
    }
  }
  return undefined
}

function isPlainObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function serializeJson(value: JsonValue): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function serializeJsObjectMultiline(value: JsonValue): string {
  if (!isPlainObject(value)) {
    return literalToSourceText(value)
  }
  const entries = Object.entries(value).map(
    ([key, entryValue]) => `  ${toPropertyName(key)}: ${literalToSourceText(entryValue)},`,
  )
  return `{\n${entries.join('\n')}\n}`
}

function serializeEslintFlatConfig(rules: JsonValue | undefined): string {
  const rulesEntries = isPlainObject(rules)
    ? Object.entries(rules).map(
        ([key, value]) => `      ${toPropertyName(key)}: ${literalToSourceText(value)},`,
      )
    : []
  const rulesBlock = rulesEntries.length > 0 ? `\n${rulesEntries.join('\n')}\n    ` : ''
  return `export default [\n  {\n    rules: {${rulesBlock}},\n  },\n]\n`
}

export interface RunMigrateOptions {
  cwd: string
  tool: string
  to: string
}

/**
 * `lintsync migrate <tool> --to <format>` (spec 4.4): converts a legacy config to a new format
 * or location. For ESLint, this specifically means eslintrc -> flat config, migrating only
 * `rules` (lossless) and reporting every other top-level key found as needing manual review
 * rather than attempting to translate it. For Prettier/Stylelint, the whole file is just data —
 * every key carries over unchanged, format-for-format (JSON/YAML/JS object literal).
 */
export function runMigrate(options: RunMigrateOptions): MigrateReport {
  const targetsForTool = TARGET_FILENAMES[options.tool]
  if (!targetsForTool) {
    return errorReport(
      options.tool,
      `Unknown tool "${options.tool}" (expected one of: ${Object.keys(TARGET_FILENAMES).join(', ')})`,
    )
  }

  const toPath = targetsForTool[options.to]
  if (!toPath) {
    return errorReport(
      options.tool,
      `Unsupported target format "${options.to}" for ${options.tool} (expected one of: ${Object.keys(targetsForTool).join(', ')})`,
    )
  }

  const fromPath = findLegacyFile(options.cwd, options.tool)
  if (!fromPath) {
    return errorReport(
      options.tool,
      `No existing ${options.tool} config found to migrate (checked: ${(LEGACY_FILENAMES[options.tool] ?? []).join(', ')})`,
    )
  }

  const fromAbsPath = join(options.cwd, fromPath)
  const toAbsPath = join(options.cwd, toPath)

  if (fromPath === toPath) {
    return errorReport(options.tool, `Source and target are the same file: ${fromPath}`)
  }
  if (existsSync(toAbsPath)) {
    return errorReport(
      options.tool,
      `Target already exists: ${toPath} (remove it first, or it would silently overwrite)`,
    )
  }

  const sourceAdapter = pickAdapter(fromPath)
  if (!sourceAdapter) {
    return errorReport(options.tool, `Unsupported source format for "${fromPath}"`)
  }

  let fileText: string
  try {
    fileText = readFileSync(fromAbsPath, 'utf8')
  } catch (cause) {
    return errorReport(options.tool, toErrorMessage(cause))
  }

  const handle = sourceAdapter.parse(fileText)
  const whole = sourceAdapter.getValueAt(handle, [])
  const rootValue: Record<string, JsonValue> = isPlainObject(whole) ? whole : {}

  let migratedKeys: string[]
  let needsManualReview: string[]
  let newText: string

  if (options.tool === 'eslint') {
    const rules = rootValue.rules
    migratedKeys = rules !== undefined ? ['rules'] : []
    needsManualReview = Object.keys(rootValue).filter((key) => !ESLINT_SAFE_KEYS.has(key))
    newText = serializeEslintFlatConfig(rules)
  } else {
    // Prettier/Stylelint configs are plain data with no schema mismatch between formats.
    migratedKeys = Object.keys(rootValue)
    needsManualReview = []
    newText =
      options.to === 'json'
        ? serializeJson(rootValue)
        : options.to === 'yaml'
          ? stringifyYaml(rootValue)
          : `export default ${serializeJsObjectMultiline(rootValue)}\n`
  }

  try {
    writeFileSync(toAbsPath, newText, 'utf8')
  } catch (cause) {
    return errorReport(options.tool, toErrorMessage(cause))
  }

  return {
    tool: options.tool,
    fromPath,
    toPath,
    migratedKeys,
    needsManualReview,
    exitCode: 0,
    error: null,
  }
}
