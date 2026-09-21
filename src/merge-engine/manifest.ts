import type { JsonValue } from './types.js'

/**
 * Ownership manifest (spec section 7.2), stored at `.lintsync/manifest.json` and committed to
 * the repo. It is not a source of truth for current state — only a record of "what lintsync
 * last applied" — sync/status always compare it against the actual file content, never trust
 * it directly.
 */
export interface ManifestEntry {
  presetValue: JsonValue
  version: string
}

export interface ToolManifest {
  preset: string
  version: string
  configPath: string
  managed: Record<string, ManifestEntry>
}

export type Manifest = Record<string, ToolManifest>

export function parseManifest(text: string): Manifest {
  return JSON.parse(text) as Manifest
}

export function serializeManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

export function createEmptyToolManifest(
  preset: string,
  version: string,
  configPath: string,
): ToolManifest {
  return { preset, version, configPath, managed: {} }
}
