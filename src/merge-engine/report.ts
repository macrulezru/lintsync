import type { PresetSnapshot, SyncChange, SyncConflict, SyncResult, SyncStatus } from './sync.js'

export interface ToolSyncAttempt {
  tool: string
  configPath: string
  preset: PresetSnapshot
  result: SyncResult | { error: string }
}

export interface ToolSyncReport {
  tool: string
  configPath: string
  preset: { name: string; version: string }
  status: SyncStatus | 'error'
  changes: SyncChange[]
  conflicts: SyncConflict[]
  error: string | null
}

export interface ProjectSyncReport {
  project: string | null
  tools: ToolSyncReport[]
  exitCode: number
}

function toToolSyncReport(attempt: ToolSyncAttempt): ToolSyncReport {
  const preset = { name: attempt.preset.name, version: attempt.preset.version }
  if ('error' in attempt.result) {
    return {
      tool: attempt.tool,
      configPath: attempt.configPath,
      preset,
      status: 'error',
      changes: [],
      conflicts: [],
      error: attempt.result.error,
    }
  }
  return {
    tool: attempt.tool,
    configPath: attempt.configPath,
    preset,
    status: attempt.result.status,
    changes: attempt.result.changes,
    conflicts: attempt.result.conflicts,
    error: null,
  }
}

/**
 * Exit codes per spec 7.5.1: 2 (error) beats 1 (unresolved conflict) beats 0 (clean or applied).
 * `--dry-run` finding changes to apply is exit 0, not 1 — only an unresolved conflict is an error.
 */
function computeExitCode(tools: ToolSyncReport[]): number {
  if (tools.some((tool) => tool.status === 'error')) {
    return 2
  }
  if (tools.some((tool) => tool.status === 'conflict')) {
    return 1
  }
  return 0
}

/** Assembles the single-project JSON report shape from spec 7.5.3 out of per-tool sync attempts. */
export function assembleProjectReport(
  attempts: ToolSyncAttempt[],
  project: string | null = null,
): ProjectSyncReport {
  const tools = attempts.map(toToolSyncReport)
  return { project, tools, exitCode: computeExitCode(tools) }
}
