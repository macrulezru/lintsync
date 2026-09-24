import { formatPathExpression } from '../merge-engine/path.js'
import type { ProjectSyncReport, ToolSyncReport } from '../merge-engine/report.js'
import type { SyncChange, SyncConflict } from '../merge-engine/sync.js'
import { pluralize } from './pluralize.js'

export type Verbosity = 'quiet' | 'default' | 'verbose'

const formatValue = (value: unknown): string => JSON.stringify(value)

function renderChange(change: SyncChange): string {
  return `${formatPathExpression(change.path)}: ${formatValue(change.from)} → ${formatValue(change.to)}`
}

function renderConflictLine(conflict: SyncConflict): string {
  return `${formatPathExpression(conflict.path)} (local: ${formatValue(conflict.fileValue)}, preset: ${formatValue(conflict.presetValue)})`
}

function renderTool(tool: ToolSyncReport, verbosity: Verbosity): string[] {
  const lines: string[] = [
    `${tool.tool} (${tool.configPath}) — preset ${tool.preset.name}@${tool.preset.version}`,
  ]

  if (tool.status === 'error') {
    lines.push(`  ✗ error: ${tool.error}`)
    return lines
  }

  if (tool.status === 'clean') {
    lines.push('  ✓ up to date')
    return lines
  }

  if (tool.changes.length > 0) {
    const word = pluralize(tool.changes.length, 'key', 'keys')
    const verb = tool.status === 'updated' ? 'updated' : 'would be updated'
    lines.push(`  ↻ ${tool.changes.length} ${word} ${verb}`)
    if (verbosity === 'verbose') {
      for (const change of tool.changes) {
        lines.push(`      ${renderChange(change)}`)
      }
    } else {
      lines.push(`      ${tool.changes.map(renderChange).join(', ')}`)
    }
  }

  if (tool.conflicts.length > 0) {
    const word = pluralize(tool.conflicts.length, 'conflict', 'conflicts')
    lines.push(`  ✗ ${tool.conflicts.length} ${word}:`)
    for (const conflict of tool.conflicts) {
      lines.push(`      ${renderConflictLine(conflict)}`)
      if (verbosity === 'verbose') {
        lines.push(`        manifest: ${formatValue(conflict.manifestValue)}`)
      }
    }
  }

  return lines
}

/**
 * Renders the human-readable output levels from spec 7.5.2. `--json` bypasses this entirely
 * (spec: printing both would be redundant), and there is no TUI branch yet (spec stages 7-8).
 */
export function renderHumanReport(report: ProjectSyncReport, verbosity: Verbosity): string {
  if (report.error) {
    return `Error: ${report.error}`
  }

  if (verbosity === 'quiet') {
    if (report.exitCode === 0) {
      return ''
    }
    const lines: string[] = []
    for (const tool of report.tools) {
      if (tool.error) {
        lines.push(`${tool.tool}: ${tool.error}`)
      }
      for (const conflict of tool.conflicts) {
        lines.push(`${tool.tool}: ${formatPathExpression(conflict.path)}`)
      }
    }
    lines.push(`Exit code: ${report.exitCode}`)
    return lines.join('\n')
  }

  const lines: string[] = []
  for (const tool of report.tools) {
    lines.push(...renderTool(tool, verbosity), '')
  }

  const totalConflicts = report.tools.reduce((sum, tool) => sum + tool.conflicts.length, 0)
  const totalErrors = report.tools.filter((tool) => tool.status === 'error').length

  const summaryParts = [`${report.tools.length} ${pluralize(report.tools.length, 'tool', 'tools')}`]
  if (totalConflicts > 0) {
    summaryParts.push(`${totalConflicts} ${pluralize(totalConflicts, 'conflict', 'conflicts')}`)
  }
  if (totalErrors > 0) {
    summaryParts.push(`${totalErrors} ${pluralize(totalErrors, 'error', 'errors')}`)
  }
  lines.push(`Total: ${summaryParts.join(', ')}. Exit code: ${report.exitCode}`)

  return lines.join('\n').trimEnd()
}
