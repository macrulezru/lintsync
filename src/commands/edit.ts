import { writeFileSync } from 'node:fs'
import { formatPathExpression, type ConfigPath } from '../merge-engine/path.js'
import { NOT_FOUND, type JsonValue } from '../merge-engine/types.js'
import { isResolveError, resolveToolConfig } from './resolve-tool-config.js'

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * `lintsync set <path> <value>` passes the value as a bare string; this tries to parse it as
 * JSON first (so `100` becomes the number 100, `true`/`false`/`null` become their real types,
 * and `["warn", {"argsIgnorePattern": "^_"}]` becomes a real array) and falls back to the raw
 * string otherwise (so `off`, unquoted, becomes the string `"off"` without the user needing to
 * shell-quote every plain word).
 */
export function parseValueArgument(raw: string): JsonValue {
  try {
    return JSON.parse(raw) as JsonValue
  } catch {
    return raw
  }
}

export interface GetOutcome {
  tool: string
  path: ConfigPath
  found: boolean
  value: unknown
  exitCode: number
  error: string | null
}

/** `lintsync get <tool>.<field...>` (spec 4.3) — reads one value without writing anything. */
export function runGet(cwd: string, fullPath: ConfigPath): GetOutcome {
  const resolved = resolveToolConfig(cwd, fullPath)
  if (isResolveError(resolved)) {
    return {
      tool: fullPath[0] ?? '',
      path: fullPath,
      found: false,
      value: undefined,
      exitCode: 2,
      error: resolved.error,
    }
  }

  const value = resolved.adapter.getValueAt(resolved.handle, resolved.subPath)
  if (value === NOT_FOUND) {
    return {
      tool: resolved.tool,
      path: fullPath,
      found: false,
      value: undefined,
      exitCode: 2,
      error: `Path not found: ${formatPathExpression(fullPath)}`,
    }
  }

  return { tool: resolved.tool, path: fullPath, found: true, value, exitCode: 0, error: null }
}

export interface SetOutcome {
  tool: string
  path: ConfigPath
  value: JsonValue
  applied: boolean
  exitCode: number
  error: string | null
}

/**
 * `lintsync set <tool>.<field...> <value>` (spec 4.3) — writes the config file directly and
 * deliberately does NOT touch `.lintsync/manifest.json`: this is a manual override, not
 * something the preset applied, so the manifest baseline stays exactly what it was. The next
 * `sync` will then correctly see file != manifest and, if it also differs from the preset,
 * surface it as a conflict — the same as if the user had hand-edited the file.
 */
export function runSet(cwd: string, fullPath: ConfigPath, rawValue: string): SetOutcome {
  const value = parseValueArgument(rawValue)
  const resolved = resolveToolConfig(cwd, fullPath)
  if (isResolveError(resolved)) {
    return {
      tool: fullPath[0] ?? '',
      path: fullPath,
      value,
      applied: false,
      exitCode: 2,
      error: resolved.error,
    }
  }

  try {
    const newText = resolved.adapter.applyEdits(resolved.handle, [
      { op: 'set', path: resolved.subPath, value },
    ])
    writeFileSync(resolved.configAbsPath, newText, 'utf8')
  } catch (cause) {
    return {
      tool: resolved.tool,
      path: fullPath,
      value,
      applied: false,
      exitCode: 2,
      error: toErrorMessage(cause),
    }
  }

  return { tool: resolved.tool, path: fullPath, value, applied: true, exitCode: 0, error: null }
}

export interface UnsetOutcome {
  tool: string
  path: ConfigPath
  applied: boolean
  exitCode: number
  error: string | null
}

/** `lintsync unset <tool>.<field...>` (spec 4.3) — same manifest-untouched reasoning as `set`. */
export function runUnset(cwd: string, fullPath: ConfigPath): UnsetOutcome {
  const resolved = resolveToolConfig(cwd, fullPath)
  if (isResolveError(resolved)) {
    return {
      tool: fullPath[0] ?? '',
      path: fullPath,
      applied: false,
      exitCode: 2,
      error: resolved.error,
    }
  }

  try {
    const newText = resolved.adapter.applyEdits(resolved.handle, [
      { op: 'delete', path: resolved.subPath },
    ])
    writeFileSync(resolved.configAbsPath, newText, 'utf8')
  } catch (cause) {
    return {
      tool: resolved.tool,
      path: fullPath,
      applied: false,
      exitCode: 2,
      error: toErrorMessage(cause),
    }
  }

  return { tool: resolved.tool, path: fullPath, applied: true, exitCode: 0, error: null }
}
