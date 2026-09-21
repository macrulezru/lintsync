import { describe, expect, it } from 'vitest'
import { assembleProjectReport, type ToolSyncAttempt } from '../../merge-engine/report.js'
import type { PresetSnapshot, SyncResult } from '../../merge-engine/sync.js'

const preset: PresetSnapshot = {
  name: 'vue-app',
  version: '1.4.0',
  values: { rules: { 'no-console': 'warn' } },
  managedKeys: [['rules', '*']],
}

const cleanResult: SyncResult = { status: 'clean', changes: [], conflicts: [], updatedManaged: {} }
const conflictResult: SyncResult = {
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
  updatedManaged: {},
}

describe('assembleProjectReport', () => {
  it('reports exitCode 0 when every tool is clean or already updated', () => {
    const attempts: ToolSyncAttempt[] = [
      { tool: 'eslint', configPath: 'eslint.config.js', preset, result: cleanResult },
      { tool: 'prettier', configPath: '.prettierrc.json', preset, result: cleanResult },
    ]

    const report = assembleProjectReport(attempts)

    expect(report.project).toBeNull()
    expect(report.exitCode).toBe(0)
    expect(report.tools).toHaveLength(2)
    expect(report.tools[0]).toEqual({
      tool: 'eslint',
      configPath: 'eslint.config.js',
      preset: { name: 'vue-app', version: '1.4.0' },
      status: 'clean',
      changes: [],
      conflicts: [],
      error: null,
    })
  })

  it('reports exitCode 1 when any tool has an unresolved conflict', () => {
    const attempts: ToolSyncAttempt[] = [
      { tool: 'eslint', configPath: 'eslint.config.js', preset, result: conflictResult },
      { tool: 'prettier', configPath: '.prettierrc.json', preset, result: cleanResult },
    ]

    const report = assembleProjectReport(attempts)

    expect(report.exitCode).toBe(1)
    expect(report.tools[0]?.status).toBe('conflict')
    expect(report.tools[0]?.conflicts).toHaveLength(1)
  })

  it('reports exitCode 2 when any tool errored, even if others also conflict', () => {
    const attempts: ToolSyncAttempt[] = [
      { tool: 'eslint', configPath: 'eslint.config.js', preset, result: conflictResult },
      {
        tool: 'stylelint',
        configPath: '.stylelintrc.json',
        preset,
        result: { error: 'Config file not found' },
      },
    ]

    const report = assembleProjectReport(attempts)

    expect(report.exitCode).toBe(2)
    expect(report.tools[1]).toEqual({
      tool: 'stylelint',
      configPath: '.stylelintrc.json',
      preset: { name: 'vue-app', version: '1.4.0' },
      status: 'error',
      changes: [],
      conflicts: [],
      error: 'Config file not found',
    })
  })

  it('carries the project name through for batch-mode callers', () => {
    const report = assembleProjectReport(
      [{ tool: 'eslint', configPath: 'eslint.config.js', preset, result: cleanResult }],
      'vuecraft',
    )
    expect(report.project).toBe('vuecraft')
  })
})
