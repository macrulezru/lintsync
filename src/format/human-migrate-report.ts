import type { MigrateReport } from '../commands/migrate.js'
import type { Verbosity } from './human-report.js'

/** Renders `migrate`'s report (spec 4.4: convert format + list what needs manual review). */
export function renderHumanMigrateReport(report: MigrateReport, verbosity: Verbosity): string {
  if (report.error) {
    return `Ошибка: ${report.error}`
  }
  if (verbosity === 'quiet') {
    return ''
  }

  const lines = [`✓ ${report.fromPath} → ${report.toPath}`]
  if (report.migratedKeys.length > 0) {
    lines.push(`  перенесено: ${report.migratedKeys.join(', ')}`)
  }
  if (report.needsManualReview.length > 0) {
    lines.push(`  требует ручной проверки: ${report.needsManualReview.join(', ')}`)
  }
  return lines.join('\n')
}
