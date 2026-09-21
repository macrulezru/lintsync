import type { BatchReport } from '../commands/batch.js'
import type { ProjectSyncReport } from '../merge-engine/report.js'
import { renderHumanReport, type Verbosity } from './human-report.js'

/** Renders a batch report (spec 7.5.3/8: `sync --all`, `status --all`) as one section per
 *  project, reusing the single-project renderer for each — the same quiet/default/verbose
 *  split, just repeated per project and closed with an aggregate line. */
export function renderHumanBatchReport(
  batch: BatchReport<ProjectSyncReport>,
  verbosity: Verbosity,
): string {
  if (verbosity === 'quiet') {
    if (batch.exitCode === 0) {
      return ''
    }
    const lines: string[] = []
    for (const project of batch.projects) {
      if (project.exitCode === 0) {
        continue
      }
      // Skip renderHumanReport's own trailing "Код возврата: N" line here — that's this
      // project's individual code, not the batch's aggregate one appended below, and showing
      // both would be confusing.
      const text = renderHumanReport(project, 'quiet')
      const detailLines = text.split('\n').filter((line) => !line.startsWith('Код возврата:'))
      for (const line of detailLines) {
        lines.push(`${project.project}: ${line}`)
      }
    }
    lines.push(`Код возврата: ${batch.exitCode}`)
    return lines.join('\n')
  }

  const lines: string[] = []
  for (const project of batch.projects) {
    lines.push(`=== ${project.project} ===`)
    const text = renderHumanReport(project, verbosity)
    if (text) {
      lines.push(text)
    }
    lines.push('')
  }
  lines.push(`Всего проектов: ${batch.projects.length}. Итоговый код возврата: ${batch.exitCode}`)

  return lines.join('\n').trimEnd()
}
