import { describe, expect, it } from 'vitest'
import type { MigrateReport } from '../../commands/migrate.js'
import { renderHumanMigrateReport } from '../../format/human-migrate-report.js'

describe('renderHumanMigrateReport', () => {
  it('shows the migrated path and what needs manual review', () => {
    const report: MigrateReport = {
      tool: 'eslint',
      fromPath: '.eslintrc.json',
      toPath: 'eslint.config.mjs',
      migratedKeys: ['rules'],
      needsManualReview: ['extends', 'env'],
      exitCode: 0,
      error: null,
    }
    const text = renderHumanMigrateReport(report, 'default')
    expect(text).toContain('✓ .eslintrc.json → eslint.config.mjs')
    expect(text).toContain('перенесено: rules')
    expect(text).toContain('требует ручной проверки: extends, env')
  })

  it('omits the review line when nothing needs manual review', () => {
    const report: MigrateReport = {
      tool: 'prettier',
      fromPath: '.prettierrc.json',
      toPath: '.prettierrc.yaml',
      migratedKeys: ['semi'],
      needsManualReview: [],
      exitCode: 0,
      error: null,
    }
    expect(renderHumanMigrateReport(report, 'default')).not.toContain('требует ручной проверки')
  })

  it('is silent in quiet mode on success', () => {
    const report: MigrateReport = {
      tool: 'prettier',
      fromPath: '.prettierrc.json',
      toPath: '.prettierrc.yaml',
      migratedKeys: ['semi'],
      needsManualReview: [],
      exitCode: 0,
      error: null,
    }
    expect(renderHumanMigrateReport(report, 'quiet')).toBe('')
  })

  it('shows the error message on failure regardless of verbosity', () => {
    const report: MigrateReport = {
      tool: 'eslint',
      fromPath: null,
      toPath: null,
      migratedKeys: [],
      needsManualReview: [],
      exitCode: 2,
      error: 'No existing eslint config found',
    }
    expect(renderHumanMigrateReport(report, 'quiet')).toBe(
      'Ошибка: No existing eslint config found',
    )
  })
})
