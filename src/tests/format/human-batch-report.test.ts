import { describe, expect, it } from 'vitest'
import type { BatchReport } from '../../commands/batch.js'
import { renderHumanBatchReport } from '../../format/human-batch-report.js'
import type { ProjectSyncReport } from '../../merge-engine/report.js'

const cleanProject: ProjectSyncReport = {
  project: 'clean-project',
  error: null,
  exitCode: 0,
  tools: [
    {
      tool: 'prettier',
      configPath: '.prettierrc.json',
      preset: { name: 'vue-app', version: '0.1.0' },
      status: 'clean',
      changes: [],
      conflicts: [],
      error: null,
    },
  ],
}

const conflictProject: ProjectSyncReport = {
  project: 'conflict-project',
  error: null,
  exitCode: 1,
  tools: [
    {
      tool: 'eslint',
      configPath: 'eslint.config.js',
      preset: { name: 'vue-app', version: '0.1.0' },
      status: 'conflict',
      changes: [],
      conflicts: [
        {
          path: ['rules', 'no-console'],
          fileValue: 'error',
          manifestValue: 'off',
          presetValue: 'warn',
        },
      ],
      error: null,
    },
  ],
}

describe('renderHumanBatchReport (default verbosity)', () => {
  it('shows a section per project plus an aggregate line', () => {
    const batch: BatchReport<ProjectSyncReport> = {
      projects: [cleanProject, conflictProject],
      exitCode: 3,
    }
    const text = renderHumanBatchReport(batch, 'default')
    expect(text).toContain('=== clean-project ===')
    expect(text).toContain('✓ актуален')
    expect(text).toContain('=== conflict-project ===')
    expect(text).toContain('✗ 1 конфликт')
    expect(text).toContain('Всего проектов: 2. Итоговый код возврата: 3')
  })
})

describe('renderHumanBatchReport (quiet verbosity)', () => {
  it('prints nothing when every project is 0', () => {
    const batch: BatchReport<ProjectSyncReport> = { projects: [cleanProject], exitCode: 0 }
    expect(renderHumanBatchReport(batch, 'quiet')).toBe('')
  })

  it('prefixes each failing project line with its name and skips clean ones', () => {
    const batch: BatchReport<ProjectSyncReport> = {
      projects: [cleanProject, conflictProject],
      exitCode: 1,
    }
    const text = renderHumanBatchReport(batch, 'quiet')
    expect(text).not.toContain('clean-project:')
    expect(text).toContain('conflict-project: eslint: rules.no-console')
    // exactly one exit-code line: the batch aggregate, not a duplicated per-project one
    expect(text.match(/Код возврата:/g)).toHaveLength(1)
    expect(text).toContain('Код возврата: 1')
  })
})
