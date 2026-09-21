import { formatPathExpression, parsePathExpression, type ConfigPath } from '../merge-engine/path.js'
import type { PresetSnapshot } from '../merge-engine/sync.js'
import type { JsonValue } from '../merge-engine/types.js'
import type { Preset, PresetToolDefinition } from './types.js'

function setAtPath(root: Record<string, JsonValue>, path: ConfigPath, value: JsonValue): void {
  if (path.length === 0) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('Cannot place a non-object preset value at the config root')
    }
    Object.assign(root, value as Record<string, JsonValue>)
    return
  }
  let cursor = root
  for (const segment of path.slice(0, -1)) {
    const next = cursor[segment]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      cursor[segment] = {}
    }
    cursor = cursor[segment] as Record<string, JsonValue>
  }
  const lastSegment = path[path.length - 1] as string
  cursor[lastSegment] = value
}

/**
 * Builds the PresetSnapshot.values tree merge-engine's syncTool needs, from a preset tool
 * definition's `rules` object and its raw managedKeys patterns (spec 7.1). Each pattern's
 * prefix (everything before its trailing `*`) is where `rules` gets placed: `rules.*` nests it
 * under a `rules` key (eslint/stylelint's shape); a bare `*` places it at the config root
 * (Prettier's flat file, spec 11.1).
 *
 * Only a trailing wildcard is supported, matching expandWildcards (merge-engine/sync.ts) and
 * every managedKeys example in the spec — a non-wildcard pattern is rejected rather than
 * guessing where to place it.
 */
export function toPresetSnapshot(preset: Preset, toolDef: PresetToolDefinition): PresetSnapshot {
  const managedKeys = toolDef.managedKeys.map(parsePathExpression)
  const values: Record<string, JsonValue> = {}

  for (const pattern of managedKeys) {
    const last = pattern[pattern.length - 1]
    if (last !== '*') {
      throw new Error(
        `managedKeys pattern "${formatPathExpression(pattern)}" must end in a wildcard '*' segment (the only form supported so far)`,
      )
    }
    setAtPath(values, pattern.slice(0, -1), toolDef.rules)
  }

  return { name: preset.name, version: preset.version, values, managedKeys }
}
