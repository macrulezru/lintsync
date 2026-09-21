import { readFileSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { jsAdapter } from '../merge-engine/js-adapter.js'
import { jsonAdapter } from '../merge-engine/json-adapter.js'
import {
  parseManifest,
  serializeManifest,
  type Manifest,
  type ManifestEntry,
  type ToolManifest,
} from '../merge-engine/manifest.js'
import { formatPathExpression } from '../merge-engine/path.js'
import {
  assembleProjectReport,
  projectSyncError,
  type ToolSyncAttempt,
} from '../merge-engine/report.js'
import {
  syncTool,
  type PresetSnapshot,
  type SyncChange,
  type SyncResult,
} from '../merge-engine/sync.js'
import type { ConfigAdapter, ConfigEdit, JsonValue } from '../merge-engine/types.js'
import { yamlAdapter } from '../merge-engine/yaml-adapter.js'
import { toPresetSnapshot } from '../presets/snapshot.js'
import type { Preset } from '../presets/types.js'
import type { PresetRegistry } from '../presets/types.js'
import type { ConflictItem, Resolution } from '../tui/types.js'

export interface RunSyncOptions {
  cwd: string
  /** Preview only; never write config files or the manifest. */
  dryRun: boolean
  /**
   * Actually apply non-conflicting changes without asking. There is still no confirmation
   * prompt for the *straightforward* case (spec 5's @clack/prompts "простые вопросы" is
   * `init`'s concern, not sync's) — `--yes` remains required to write those. Conflicts are a
   * separate matter: if `interactive` is true and this is false, resolving them through the
   * TUI (below) counts as the user's explicit per-conflict confirmation, and writes those
   * regardless of `--yes`. `--dry-run` always wins over both if given.
   */
  yes: boolean
  /**
   * Whether a live interactive terminal is available (spec 4.5: TUI only when the terminal is
   * interactive and there are conflicts). Resolved from `process.stdin/stdout.isTTY` by the CLI
   * layer (which also folds in `--json` — machine output always takes the non-interactive path
   * regardless of TTY-ness), not detected here, so this stays testable without faking global
   * process state.
   */
  interactive: boolean
  /** Restrict to a single tool from the manifest (spec 8: `sync [--tool]`). */
  tool?: string
  presetRegistry: PresetRegistry
  /**
   * Resolves a batch of conflicts interactively; defaults to lazily loading the real ink TUI
   * (src/tui/run-conflict-resolver.tsx) so non-interactive runs never pay for importing
   * React/Ink. Tests inject a fake resolver instead of driving a real terminal.
   */
  resolveConflicts?: (conflicts: ConflictItem[]) => Promise<Resolution[]>
}

const MANIFEST_RELATIVE_PATH = join('.lintsync', 'manifest.json')

function pickAdapter(configPath: string): ConfigAdapter | undefined {
  const ext = extname(configPath).toLowerCase()
  if (ext === '.json' || ext === '.jsonc') {
    return jsonAdapter
  }
  if (ext === '.yaml' || ext === '.yml') {
    return yamlAdapter
  }
  if (
    ext === '.js' ||
    ext === '.mjs' ||
    ext === '.cjs' ||
    ext === '.ts' ||
    ext === '.mts' ||
    ext === '.cts'
  ) {
    return jsAdapter
  }
  return undefined
}

async function defaultResolveConflicts(conflicts: ConflictItem[]): Promise<Resolution[]> {
  const { resolveConflictsInteractively } = await import('../tui/run-conflict-resolver.js')
  return resolveConflictsInteractively(conflicts)
}

interface ToolSyncOutcome {
  attempt: ToolSyncAttempt
  updatedToolManifest?: ToolManifest
}

function errorOutcome(
  toolName: string,
  configPath: string,
  preset: { name: string; version: string },
  message: string,
): ToolSyncOutcome {
  return {
    attempt: { tool: toolName, configPath, preset, result: { error: message } },
  }
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Applies changes chosen through the TUI (plus any non-conflicting changes already found for
 * the same tool) in a single edit batch, so a tool the user just engaged with in the TUI ends
 * up fully in sync, not half-applied. Every resolved key — whichever choice produced it — is
 * recorded in the manifest against the preset's own current value, matching how every other
 * managed key is tracked; a "keep local"/"manual" choice is therefore a per-run decision, not a
 * permanent pin, since the manifest schema (spec 7.2) has no field for "intentionally diverges
 * forever" — the same conflict will resurface next sync unless the file or preset changes.
 */
function applyResolvedConflicts(
  adapter: ConfigAdapter,
  fileText: string,
  presetVersion: string,
  planChanges: SyncChange[],
  conflicts: SyncResult['conflicts'],
  resolutions: Resolution[],
  manifestManaged: Record<string, ManifestEntry>,
): { newText: string; updatedManaged: Record<string, ManifestEntry> } {
  const edits: ConfigEdit[] = []
  const updatedManaged: Record<string, ManifestEntry> = { ...manifestManaged }

  for (const change of planChanges) {
    edits.push({ op: 'set', path: change.path, value: change.to })
    updatedManaged[formatPathExpression(change.path)] = {
      presetValue: change.to,
      version: presetVersion,
    }
  }

  for (const resolution of resolutions) {
    const value = resolution.value as JsonValue
    edits.push({ op: 'set', path: resolution.path, value })
    const key = formatPathExpression(resolution.path)
    const conflict = conflicts.find((c) => formatPathExpression(c.path) === key)
    const presetValue = conflict ? (conflict.presetValue as JsonValue) : value
    updatedManaged[key] = { presetValue, version: presetVersion }
  }

  const newText = adapter.applyEdits(adapter.parse(fileText), edits)
  return { newText, updatedManaged }
}

async function syncOneTool(
  options: RunSyncOptions,
  applyChanges: boolean,
  canUseTui: boolean,
  toolName: string,
  toolManifest: ToolManifest,
): Promise<ToolSyncOutcome> {
  const preset: Preset | undefined = options.presetRegistry.getPreset(toolManifest.preset)
  if (!preset) {
    return errorOutcome(
      toolName,
      toolManifest.configPath,
      { name: toolManifest.preset, version: toolManifest.version },
      `Preset "${toolManifest.preset}" is not registered`,
    )
  }

  const presetDisplay = { name: preset.name, version: preset.version }

  const toolDef = preset.tools[toolName]
  if (!toolDef) {
    return errorOutcome(
      toolName,
      toolManifest.configPath,
      presetDisplay,
      `Preset "${preset.name}" does not define tool "${toolName}"`,
    )
  }

  const adapter = pickAdapter(toolManifest.configPath)
  if (!adapter) {
    return errorOutcome(
      toolName,
      toolManifest.configPath,
      presetDisplay,
      `Unsupported config format for "${toolManifest.configPath}" (only .json/.jsonc/.yaml/.yml/.js/.mjs/.cjs/.ts/.mts/.cts are implemented so far)`,
    )
  }

  const configAbsPath = join(options.cwd, toolManifest.configPath)
  let fileText: string
  try {
    fileText = readFileSync(configAbsPath, 'utf8')
  } catch {
    return errorOutcome(
      toolName,
      toolManifest.configPath,
      presetDisplay,
      `Config file not found: ${toolManifest.configPath}`,
    )
  }

  const presetSnapshot: PresetSnapshot = toPresetSnapshot(preset, toolDef)

  // Always plan first (dry-run) so conflicts are known before deciding whether to prompt —
  // the JS/TS adapter's UnsupportedEditError can only come from applyEdits, so this never
  // throws it; it's caught around the real apply calls below instead.
  let planResult: SyncResult
  try {
    planResult = syncTool({
      adapter,
      fileText,
      preset: presetSnapshot,
      manifestManaged: toolManifest.managed,
      dryRun: true,
    })
  } catch (cause) {
    return errorOutcome(toolName, toolManifest.configPath, presetDisplay, toErrorMessage(cause))
  }

  if (planResult.status === 'conflict' && canUseTui) {
    const resolveConflicts = options.resolveConflicts ?? defaultResolveConflicts
    const resolutions = await resolveConflicts(planResult.conflicts)
    if (resolutions.length === planResult.conflicts.length) {
      try {
        const { newText, updatedManaged } = applyResolvedConflicts(
          adapter,
          fileText,
          preset.version,
          planResult.changes,
          planResult.conflicts,
          resolutions,
          toolManifest.managed,
        )
        writeFileSync(configAbsPath, newText, 'utf8')
        const resolvedChanges: SyncChange[] = [
          ...planResult.changes,
          ...resolutions.map((resolution) => ({
            path: resolution.path,
            from: planResult.conflicts.find(
              (c) => formatPathExpression(c.path) === formatPathExpression(resolution.path),
            )?.fileValue,
            to: resolution.value as JsonValue,
          })),
        ]
        return {
          attempt: {
            tool: toolName,
            configPath: toolManifest.configPath,
            preset: presetDisplay,
            result: {
              status: 'updated',
              changes: resolvedChanges,
              conflicts: [],
              newText,
              updatedManaged,
            },
          },
          updatedToolManifest: {
            ...toolManifest,
            version: preset.version,
            managed: updatedManaged,
          },
        }
      } catch (cause) {
        return errorOutcome(toolName, toolManifest.configPath, presetDisplay, toErrorMessage(cause))
      }
    }
  }

  if (!applyChanges || (planResult.status !== 'would-update' && planResult.status !== 'clean')) {
    return {
      attempt: {
        tool: toolName,
        configPath: toolManifest.configPath,
        preset: presetDisplay,
        result: planResult,
      },
    }
  }

  let result: SyncResult
  try {
    result = syncTool({
      adapter,
      fileText,
      preset: presetSnapshot,
      manifestManaged: toolManifest.managed,
      dryRun: false,
    })
  } catch (cause) {
    return errorOutcome(toolName, toolManifest.configPath, presetDisplay, toErrorMessage(cause))
  }

  if (result.status === 'updated' && result.newText !== undefined) {
    writeFileSync(configAbsPath, result.newText, 'utf8')
  }

  const attempt: ToolSyncAttempt = {
    tool: toolName,
    configPath: toolManifest.configPath,
    preset: presetDisplay,
    result,
  }

  if (result.status !== 'updated' && result.status !== 'clean') {
    return { attempt }
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
 * Runs `sync` for one project directory (spec 12.2 stages 4 and 8). Reads
 * `.lintsync/manifest.json` plus each managed tool's config file from disk, delegates the
 * actual comparison to merge-engine (which never touches the filesystem itself), and writes
 * back only what changed. When a real interactive terminal is available and there's no
 * `--dry-run`/`--yes`/`--json`, a conflict launches the ink TUI (spec stage 7) to resolve it;
 * otherwise a conflict is reported and left entirely untouched, matching the non-interactive/CI
 * path from spec 4.5/7.4.4.
 */
export async function runSync(options: RunSyncOptions) {
  const manifestPath = join(options.cwd, MANIFEST_RELATIVE_PATH)
  const applyChanges = !options.dryRun && options.yes
  const canUseTui = options.interactive && !options.dryRun && !options.yes

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
    return projectSyncError(`Could not parse ${MANIFEST_RELATIVE_PATH}: ${toErrorMessage(cause)}`)
  }

  const attempts: ToolSyncAttempt[] = []
  const nextManifest: Manifest = { ...manifest }
  let manifestChanged = false

  for (const [toolName, toolManifest] of Object.entries(manifest)) {
    if (options.tool && options.tool !== toolName) {
      continue
    }

    const outcome = await syncOneTool(options, applyChanges, canUseTui, toolName, toolManifest)
    attempts.push(outcome.attempt)
    if (outcome.updatedToolManifest) {
      nextManifest[toolName] = outcome.updatedToolManifest
      manifestChanged = true
    }
  }

  if (manifestChanged) {
    writeFileSync(manifestPath, serializeManifest(nextManifest), 'utf8')
  }

  return assembleProjectReport(attempts)
}
