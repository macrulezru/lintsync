import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseManifest } from '../merge-engine/manifest.js'
import type { ConfigPath } from '../merge-engine/path.js'
import type { ConfigAdapter } from '../merge-engine/types.js'
import { pickAdapter } from './pick-adapter.js'

const MANIFEST_RELATIVE_PATH = join('.lintsync', 'manifest.json')

export interface ResolvedToolConfig {
  tool: string
  /** The path with the leading tool segment stripped — the actual in-file path. */
  subPath: ConfigPath
  configAbsPath: string
  configPath: string
  fileText: string
  adapter: ConfigAdapter
  handle: unknown
}

export interface ResolveError {
  error: string
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Resolves `<tool>.<field...>` (spec 4.3's `get`/`set`/`unset` path syntax — the tool is the
 * path's own first segment, e.g. `eslint.rules.no-console`, `prettier.printWidth`) down to the
 * actual config file and a parsed handle, via the manifest's `configPath` for that tool. Shared
 * by get/set/unset so all three agree on lookup failures.
 */
export function resolveToolConfig(
  cwd: string,
  fullPath: ConfigPath,
): ResolvedToolConfig | ResolveError {
  if (fullPath.length < 2) {
    return {
      error:
        'Path must start with a tool name followed by at least one field, e.g. eslint.rules.no-console',
    }
  }
  const [tool, ...subPath] = fullPath as [string, ...ConfigPath]

  const manifestPath = join(cwd, MANIFEST_RELATIVE_PATH)
  let manifestText: string
  try {
    manifestText = readFileSync(manifestPath, 'utf8')
  } catch {
    return { error: `No manifest found at ${MANIFEST_RELATIVE_PATH}. Run \`lintsync init\` first.` }
  }

  let toolManifest
  try {
    const manifest = parseManifest(manifestText)
    toolManifest = manifest[tool]
  } catch (cause) {
    return { error: `Could not parse ${MANIFEST_RELATIVE_PATH}: ${toErrorMessage(cause)}` }
  }
  if (!toolManifest) {
    return {
      error: `Tool "${tool}" is not tracked in the manifest. Run \`lintsync init ${tool}\` first.`,
    }
  }

  const configAbsPath = join(cwd, toolManifest.configPath)
  let fileText: string
  try {
    fileText = readFileSync(configAbsPath, 'utf8')
  } catch {
    return { error: `Config file not found: ${toolManifest.configPath}` }
  }

  const adapter = pickAdapter(toolManifest.configPath)
  if (!adapter) {
    return { error: `Unsupported config format for "${toolManifest.configPath}"` }
  }

  return {
    tool,
    subPath,
    configAbsPath,
    configPath: toolManifest.configPath,
    fileText,
    adapter,
    handle: adapter.parse(fileText),
  }
}

export function isResolveError(value: ResolvedToolConfig | ResolveError): value is ResolveError {
  return 'error' in value
}
