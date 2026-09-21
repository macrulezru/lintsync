import { readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { jsonAdapter } from '../merge-engine/json-adapter.js'
import {
  parseManifest,
  serializeManifest,
  type Manifest,
  type ToolManifest,
} from '../merge-engine/manifest.js'
import {
  assembleProjectReport,
  projectSyncError,
  type ToolSyncAttempt,
} from '../merge-engine/report.js'
import { syncTool } from '../merge-engine/sync.js'
import type { ConfigAdapter } from '../merge-engine/types.js'
import { toPresetSnapshot } from '../presets/snapshot.js'
import type { PresetRegistry } from '../presets/types.js'

export interface RunSyncOptions {
  cwd: string
  /** Preview only; never write config files or the manifest. */
  dryRun: boolean
  /**
   * Actually apply non-conflicting changes. There is no interactive confirmation prompt yet
   * (spec 4.5/5's TUI is stages 7-8) — until then, writing requires an explicit `--yes`, the
   * same safe default the spec uses for the non-interactive/CI path. `--dry-run` always wins
   * over `--yes` if both are given.
   */
  yes: boolean
  /** Restrict to a single tool from the manifest (spec 8: `sync [--tool]`). */
  tool?: string
  presetRegistry: PresetRegistry
}

const MANIFEST_RELATIVE_PATH = join('.lintsync', 'manifest.json')

function pickAdapter(configPath: string): ConfigAdapter | undefined {
  const ext = extname(configPath).toLowerCase()
  return ext === '.json' || ext === '.jsonc' ? jsonAdapter : undefined
}

interface ToolSyncOutcome {
  attempt: ToolSyncAttempt
  updatedToolManifest?: ToolManifest
}

function syncOneTool(
  options: RunSyncOptions,
  applyChanges: boolean,
  toolName: string,
  toolManifest: ToolManifest,
): ToolSyncOutcome {
  const preset = options.presetRegistry.getPreset(toolManifest.preset)
  if (!preset) {
    return {
      attempt: {
        tool: toolName,
        configPath: toolManifest.configPath,
        preset: { name: toolManifest.preset, version: toolManifest.version },
        result: { error: `Preset "${toolManifest.preset}" is not registered` },
      },
    }
  }

  const presetDisplay = { name: preset.name, version: preset.version }

  const toolDef = preset.tools[toolName]
  if (!toolDef) {
    return {
      attempt: {
        tool: toolName,
        configPath: toolManifest.configPath,
        preset: presetDisplay,
        result: { error: `Preset "${preset.name}" does not define tool "${toolName}"` },
      },
    }
  }

  const adapter = pickAdapter(toolManifest.configPath)
  if (!adapter) {
    return {
      attempt: {
        tool: toolName,
        configPath: toolManifest.configPath,
        preset: presetDisplay,
        result: {
          error: `Unsupported config format for "${toolManifest.configPath}" (only .json/.jsonc are implemented so far)`,
        },
      },
    }
  }

  const configAbsPath = join(options.cwd, toolManifest.configPath)
  let fileText: string
  try {
    fileText = readFileSync(configAbsPath, 'utf8')
  } catch {
    return {
      attempt: {
        tool: toolName,
        configPath: toolManifest.configPath,
        preset: presetDisplay,
        result: { error: `Config file not found: ${toolManifest.configPath}` },
      },
    }
  }

  const presetSnapshot = toPresetSnapshot(preset, toolDef)
  const result = syncTool({
    adapter,
    fileText,
    preset: presetSnapshot,
    manifestManaged: toolManifest.managed,
    dryRun: !applyChanges,
  })

  const attempt: ToolSyncAttempt = {
    tool: toolName,
    configPath: toolManifest.configPath,
    preset: presetDisplay,
    result,
  }

  if (!applyChanges || (result.status !== 'updated' && result.status !== 'clean')) {
    return { attempt }
  }

  if (result.status === 'updated' && result.newText !== undefined) {
    writeFileSync(configAbsPath, result.newText, 'utf8')
  }

  return {
    attempt,
    updatedToolManifest: {
      ...toolManifest,
      version: preset.version,
      managed: result.updatedManaged,
    },
  }
}

/**
 * Runs `sync` for one project directory (spec 12.2 stage 4). Reads `.lintsync/manifest.json`
 * plus each managed tool's config file from disk, delegates the actual comparison to
 * merge-engine (which never touches the filesystem itself), and writes back only what changed.
 * No TUI yet: any conflict is reported and left entirely untouched, matching the
 * non-interactive/CI path from spec 4.5/7.4.4.
 */
export function runSync(options: RunSyncOptions) {
  const manifestPath = join(options.cwd, MANIFEST_RELATIVE_PATH)
  const applyChanges = !options.dryRun && options.yes

  let manifestText: string
  try {
    manifestText = readFileSync(manifestPath, 'utf8')
  } catch {
    return projectSyncError(
      `No manifest found at ${MANIFEST_RELATIVE_PATH}. Run \`lintsync init\` first.`,
    )
  }

  let manifest: Manifest
  try {
    manifest = parseManifest(manifestText)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return projectSyncError(`Could not parse ${MANIFEST_RELATIVE_PATH}: ${message}`)
  }

  const attempts: ToolSyncAttempt[] = []
  const nextManifest: Manifest = { ...manifest }
  let manifestChanged = false

  for (const [toolName, toolManifest] of Object.entries(manifest)) {
    if (options.tool && options.tool !== toolName) {
      continue
    }

    const outcome = syncOneTool(options, applyChanges, toolName, toolManifest)
    attempts.push(outcome.attempt)
    if (outcome.updatedToolManifest) {
      nextManifest[toolName] = outcome.updatedToolManifest
      manifestChanged = true
    }
  }

  if (applyChanges && manifestChanged) {
    writeFileSync(manifestPath, serializeManifest(nextManifest), 'utf8')
  }

  return assembleProjectReport(attempts)
}
