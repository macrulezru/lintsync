import type { InitToolReport, ProjectInitReport } from '../commands/init.js'
import type { Verbosity } from './human-report.js'
import { pluralize } from './pluralize.js'

const STATUS_ICON: Record<InitToolReport['status'], string> = {
  created: '✓',
  skipped: '⏭',
  error: '✗',
}

const STATUS_LABEL: Record<InitToolReport['status'], string> = {
  created: 'created',
  skipped: 'skipped',
  error: 'error',
}

function renderTool(tool: InitToolReport): string {
  const base = `  ${STATUS_ICON[tool.status]} ${tool.tool} (${tool.configPath}) — ${STATUS_LABEL[tool.status]}`
  return tool.message ? `${base}: ${tool.message}` : base
}

/** Renders `init`'s human-readable output levels, mirroring sync's quiet/default/verbose split
 *  (spec 7.5.2) for a consistent CLI feel even though `init` has its own report shape. */
export function renderHumanInitReport(report: ProjectInitReport, verbosity: Verbosity): string {
  if (report.error) {
    return `Error: ${report.error}`
  }

  if (verbosity === 'quiet') {
    if (report.exitCode === 0) {
      return ''
    }
    const lines = report.tools
      .filter((tool) => tool.status === 'error')
      .map((tool) => `${tool.tool}: ${tool.message}`)
    lines.push(`Exit code: ${report.exitCode}`)
    return lines.join('\n')
  }

  const lines: string[] = [`preset ${report.preset?.name}@${report.preset?.version}`]
  for (const tool of report.tools) {
    lines.push(renderTool(tool))
  }

  if (report.dependenciesInstalled.length > 0) {
    const word = pluralize(report.dependenciesInstalled.length, 'package', 'packages')
    lines.push(
      `  ${report.dependenciesInstalled.length} ${word} installed: ${report.dependenciesInstalled.join(', ')}`,
    )
  }
  if (report.scriptsUpdated.length > 0) {
    lines.push(`  npm scripts updated: ${report.scriptsUpdated.join(', ')}`)
  }

  const created = report.tools.filter((tool) => tool.status === 'created').length
  const skipped = report.tools.filter((tool) => tool.status === 'skipped').length
  const errored = report.tools.filter((tool) => tool.status === 'error').length

  const summaryParts = [`${created} created`]
  if (skipped > 0) {
    summaryParts.push(`${skipped} skipped`)
  }
  if (errored > 0) {
    summaryParts.push(`${errored} ${pluralize(errored, 'error', 'errors')}`)
  }
  lines.push('')
  lines.push(`Total: ${summaryParts.join(', ')}. Exit code: ${report.exitCode}`)

  return lines.join('\n').trimEnd()
}
