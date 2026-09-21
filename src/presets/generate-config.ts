import { literalToSourceText, toPropertyName } from '../merge-engine/js-adapter.js'
import type { JsonValue } from '../merge-engine/types.js'
import { toPresetSnapshot } from './snapshot.js'
import type { Preset, PresetToolDefinition } from './types.js'

function formatRulesBlock(rules: JsonValue): string {
  if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) {
    throw new Error("Expected a preset tool's rules to be a plain object")
  }
  const entries = Object.entries(rules).map(
    ([key, value]) => `      ${toPropertyName(key)}: ${literalToSourceText(value)},`,
  )
  return `    rules: {\n${entries.join('\n')}\n    },`
}

/**
 * Generates a real, runnable `eslint.config.js` (spec 11.1's flat config + baseExtends):
 * imports for each base config, spread into the exported array, with the preset's own rules as
 * the trailing object — the shape the JS/TS adapter's array-export support (merge-engine/
 * js-adapter.ts) manages, and the one `sync` will read back from on every future run.
 */
function generateFlatEslintConfig(toolDef: PresetToolDefinition): string {
  if (toolDef.configFormat !== 'flat') {
    throw new Error('generateFlatEslintConfig requires a flat-format tool definition')
  }
  const baseExtends = toolDef.baseExtends ?? []
  const importLines = baseExtends.map(
    (base) => `import ${base.importName} from '${base.importPath}'`,
  )
  const spreadLines = baseExtends.map((base) => `  ...${base.expression},`)

  const importsBlock = importLines.length > 0 ? `${importLines.join('\n')}\n\n` : ''
  const arrayBody = [...spreadLines, '  {', formatRulesBlock(toolDef.rules), '  },'].join('\n')

  return `${importsBlock}export default [\n${arrayBody}\n]\n`
}

/** Generates a plain JSON config (Prettier/Stylelint, spec 11.1): `extends` first, then the
 *  preset's own values in the shape managedKeys implies (flat for Prettier, under `rules` for
 *  Stylelint) — reusing toPresetSnapshot so init writes exactly what sync will later expect. */
function generateJsonConfig(preset: Preset, toolDef: PresetToolDefinition): string {
  if (toolDef.configFormat !== 'json') {
    throw new Error('generateJsonConfig requires a json-format tool definition')
  }
  const { values } = toPresetSnapshot(preset, toolDef)
  const extendsPackages = toolDef.extendsPackages
  const body: Record<string, JsonValue> =
    extendsPackages && extendsPackages.length > 0
      ? { extends: extendsPackages, ...(values as Record<string, JsonValue>) }
      : (values as Record<string, JsonValue>)
  return `${JSON.stringify(body, null, 2)}\n`
}

/** Generates the initial file content `init` writes for one preset tool (spec 4.1). */
export function generateInitialConfig(preset: Preset, toolDef: PresetToolDefinition): string {
  return toolDef.configFormat === 'flat'
    ? generateFlatEslintConfig(toolDef)
    : generateJsonConfig(preset, toolDef)
}
