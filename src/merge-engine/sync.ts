import { deepEqual } from './deep-equal.js'
import { jsonAdapter, type JsonHandle } from './json-adapter.js'
import type { ManifestEntry } from './manifest.js'
import { formatPathExpression, matchesPattern, type ConfigPath } from './path.js'
import { NOT_FOUND, type ConfigAdapter, type ConfigEdit, type JsonValue } from './types.js'

export type SyncStatus = 'clean' | 'would-update' | 'updated' | 'conflict'

export interface SyncChange {
  path: ConfigPath
  from: unknown
  to: JsonValue
}

export interface SyncConflict {
  path: ConfigPath
  fileValue: unknown
  manifestValue: unknown
  presetValue: unknown
}

export interface SyncResult {
  status: SyncStatus
  changes: SyncChange[]
  conflicts: SyncConflict[]
  /** New file text, present only when status is 'updated'. */
  newText?: string
  /** Manifest.managed entries this tool's manifest should be replaced with, when applied. */
  updatedManaged: Record<string, ManifestEntry>
}

export interface PresetSnapshot {
  name: string
  version: string
  /** Plain object mirroring the config file's own shape at the paths covered by managedKeys
   *  (e.g. `{ rules: { 'no-console': 'warn' } }` for eslint, or a flat object for Prettier). */
  values: JsonValue
  /** Parsed managedKeys patterns (spec 7.1); a `*` segment matches exactly one path segment. */
  managedKeys: ConfigPath[]
}

export interface SyncToolInput {
  adapter: ConfigAdapter
  fileText: string
  preset: PresetSnapshot
  /** Previous manifest.managed for this tool, keyed by formatPathExpression(path). */
  manifestManaged: Record<string, ManifestEntry>
  dryRun: boolean
}

/**
 * Enumerates concrete paths matched by managedKeys patterns (spec 7.4.4 `expandWildcards`).
 * Only a trailing `*` is supported (the only form the spec documents: `rules.*`, `*`) — it
 * matches exactly one segment, not a recursive glob. Candidates are the union of paths
 * actually present in the file and paths defined by the preset itself, so a rule newly added
 * in a preset update is picked up even before it exists in the project's config file.
 */
export function expandWildcards(
  patterns: ConfigPath[],
  fileAdapter: ConfigAdapter,
  fileHandle: unknown,
  presetHandle: JsonHandle,
): ConfigPath[] {
  const seen = new Set<string>()
  const result: ConfigPath[] = []

  const addPath = (path: ConfigPath): void => {
    const key = JSON.stringify(path)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(path)
    }
  }

  for (const pattern of patterns) {
    const wildcardIndex = pattern.indexOf('*')
    if (wildcardIndex === -1) {
      addPath(pattern)
      continue
    }
    const prefix = pattern.slice(0, wildcardIndex)
    const candidates = [
      ...fileAdapter.listPaths(fileHandle, prefix),
      ...jsonAdapter.listPaths(presetHandle, prefix),
    ]
    for (const candidate of candidates) {
      if (matchesPattern(pattern, candidate)) {
        addPath(candidate)
      }
    }
  }

  return result
}

/**
 * Syncs a single tool's config against its preset (spec 7.4.4). Pure function: takes file text
 * in, returns new file text out — no filesystem access, so the engine stays testable and
 * isolated from the CLI (spec 12.4). A conflict on any managed key withholds ALL changes for
 * this tool ("ничего не перезаписывается молча", spec 4.5) — the caller decides what to do next
 * (TUI, or surface the conflict non-interactively).
 */
export function syncTool(input: SyncToolInput): SyncResult {
  const { adapter, fileText, preset, manifestManaged, dryRun } = input

  const handle = adapter.parse(fileText)
  const presetHandle = jsonAdapter.parse(JSON.stringify(preset.values))

  const managedPaths = expandWildcards(preset.managedKeys, adapter, handle, presetHandle)

  const changes: SyncChange[] = []
  const conflicts: SyncConflict[] = []
  const updatedManaged: Record<string, ManifestEntry> = { ...manifestManaged }

  for (const path of managedPaths) {
    const key = formatPathExpression(path)

    const rawFileValue = adapter.getValueAt(handle, path)
    const fileValue = rawFileValue === NOT_FOUND ? undefined : rawFileValue

    const rawPresetValue = jsonAdapter.getValueAt(presetHandle, path)
    if (rawPresetValue === NOT_FOUND) {
      // Preset no longer defines this path (dropped in a newer preset version, spec 11.3) —
      // nothing to sync toward; stop tracking it.
      delete updatedManaged[key]
      continue
    }
    const presetValue = rawPresetValue as JsonValue

    const manifestEntry = manifestManaged[key]
    const manifestValue = manifestEntry?.presetValue

    if (deepEqual(fileValue, manifestValue)) {
      // User hasn't touched this key since the last sync (or it never existed before).
      if (!deepEqual(fileValue, presetValue)) {
        changes.push({ path, from: fileValue, to: presetValue })
      }
      updatedManaged[key] = { presetValue, version: preset.version }
    } else if (deepEqual(fileValue, presetValue)) {
      // Already matches the preset; nothing to write, just refresh manifest bookkeeping.
      updatedManaged[key] = { presetValue, version: preset.version }
    } else {
      conflicts.push({ path, fileValue, manifestValue, presetValue })
    }
  }

  if (conflicts.length > 0) {
    return { status: 'conflict', changes, conflicts, updatedManaged: manifestManaged }
  }

  if (changes.length === 0) {
    return { status: 'clean', changes, conflicts, updatedManaged }
  }

  if (dryRun) {
    return { status: 'would-update', changes, conflicts, updatedManaged }
  }

  const edits: ConfigEdit[] = changes.map((change) => ({
    op: 'set',
    path: change.path,
    value: change.to,
  }))
  const newText = adapter.applyEdits(handle, edits)
  return { status: 'updated', changes, conflicts, newText, updatedManaged }
}
