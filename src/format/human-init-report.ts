import type { InitToolReport, ProjectInitReport } from '../commands/init.js'
import type { Verbosity } from './human-report.js'
import { pluralizeRu } from './pluralize-ru.js'

const STATUS_ICON: Record<InitToolReport['status'], string> = {
  created: '✓',
  skipped: '⏭',
  error: '✗',
}

const STATUS_LABEL: Record<InitToolReport['status'], string> = {
  created: 'создан',
  skipped: 'пропущен',
  error: 'ошибка',
}

function renderTool(tool: InitToolReport): string {
  const base = `  ${STATUS_ICON[tool.status]} ${tool.tool} (${tool.configPath}) — ${STATUS_LABEL[tool.status]}`
  return tool.message ? `${base}: ${tool.message}` : base
}

/** Renders `init`'s human-readable output levels, mirroring sync's quiet/default/verbose split
 *  (spec 7.5.2) for a consistent CLI feel even though `init` has its own report shape. */
export function renderHumanInitReport(report: ProjectInitReport, verbosity: Verbosity): string {
  if (report.error) {
    return `Ошибка: ${report.error}`
  }

  if (verbosity === 'quiet') {
    if (report.exitCode === 0) {
      return ''
    }
    const lines = report.tools
      .filter((tool) => tool.status === 'error')
      .map((tool) => `${tool.tool}: ${tool.message}`)
    lines.push(`Код возврата: ${report.exitCode}`)
    return lines.join('\n')
  }

  const lines: string[] = [`preset ${report.preset?.name}@${report.preset?.version}`]
  for (const tool of report.tools) {
    lines.push(renderTool(tool))
  }

  if (report.dependenciesInstalled.length > 0) {
    lines.push(
      `  ${pluralizeRu(report.dependenciesInstalled.length, 'пакет установлен', 'пакета установлено', 'пакетов установлено')}: ${report.dependenciesInstalled.join(', ')}`,
    )
  }
  if (report.scriptsUpdated.length > 0) {
    lines.push(`  npm-скрипты обновлены: ${report.scriptsUpdated.join(', ')}`)
  }

  const created = report.tools.filter((tool) => tool.status === 'created').length
  const skipped = report.tools.filter((tool) => tool.status === 'skipped').length
  const errored = report.tools.filter((tool) => tool.status === 'error').length

  const summaryParts = [`${created} ${pluralizeRu(created, 'создан', 'создано', 'создано')}`]
  if (skipped > 0) {
    summaryParts.push(`${skipped} ${pluralizeRu(skipped, 'пропущен', 'пропущено', 'пропущено')}`)
  }
  if (errored > 0) {
    summaryParts.push(`${errored} ${pluralizeRu(errored, 'ошибка', 'ошибки', 'ошибок')}`)
  }
  lines.push('')
  lines.push(`Итого: ${summaryParts.join(', ')}. Код возврата: ${report.exitCode}`)

  return lines.join('\n').trimEnd()
}
