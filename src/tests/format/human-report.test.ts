import { describe, expect, it } from 'vitest'
import { renderHumanReport } from '../../format/human-report.js'
import type { ProjectSyncReport } from '../../merge-engine/report.js'

const cleanReport: ProjectSyncReport = {
  project: null,
  error: null,
  exitCode: 0,
  tools: [
    {
      tool: 'prettier',
      configPath: '.prettierrc.json',
      preset: { name: 'vue-app', version: '1.4.0' },
      status: 'clean',
      changes: [],
      conflicts: [],
      error: null,
    },
  ],
}

const wouldUpdateReport: ProjectSyncReport = {
  project: null,
  error: null,
  exitCode: 0,
  tools: [
    {
      tool: 'eslint',
      configPath: 'eslint.config.json',
      preset: { name: 'vue-app', version: '1.4.0' },
      status: 'would-update',
      changes: [{ path: ['rules', 'no-console'], from: 'off', to: 'warn' }],
      conflicts: [],
      error: null,
    },
  ],
}

const conflictReport: ProjectSyncReport = {
  project: null,
  error: null,
  exitCode: 1,
  tools: [
    {
      tool: 'eslint',
      configPath: 'eslint.config.json',
      preset: { name: 'vue-app', version: '1.4.0' },
      status: 'conflict',
      changes: [],
      conflicts: [
        {
          path: ['rules', 'vue/multi-word-component-names'],
          fileValue: 'warn',
          manifestValue: 'off',
          presetValue: 'off',
        },
      ],
      error: null,
    },
  ],
}

const errorReport: ProjectSyncReport = {
  project: null,
  error: null,
  exitCode: 2,
  tools: [
    {
      tool: 'stylelint',
      configPath: '.stylelintrc.json',
      preset: { name: 'vue-app', version: '1.4.0' },
      status: 'error',
      changes: [],
      conflicts: [],
      error: 'Config file not found: .stylelintrc.json',
    },
  ],
}

describe('renderHumanReport (default verbosity)', () => {
  it('shows a clean tool as up to date', () => {
    const text = renderHumanReport(cleanReport, 'default')
    expect(text).toContain('prettier (.prettierrc.json)')
    expect(text).toContain('✓ up to date')
    expect(text).toContain('Exit code: 0')
  })

  it('shows a would-update tool with the change summary', () => {
    const text = renderHumanReport(wouldUpdateReport, 'default')
    expect(text).toContain('↻ 1 key would be updated')
    expect(text).toContain('rules.no-console: "off" → "warn"')
  })

  it('shows a conflict with local/preset values, path rendered via formatPathExpression', () => {
    const text = renderHumanReport(conflictReport, 'default')
    expect(text).toContain('✗ 1 conflict:')
    // no literal '.' in the segment, so formatPathExpression uses the bare dot form, not brackets
    expect(text).toContain('rules.vue/multi-word-component-names')
    expect(text).toContain('local: "warn"')
    expect(text).toContain('preset: "off"')
    expect(text).toContain('Exit code: 1')
  })

  it('shows a per-tool error', () => {
    const text = renderHumanReport(errorReport, 'default')
    expect(text).toContain('✗ error: Config file not found: .stylelintrc.json')
    expect(text).toContain('Exit code: 2')
  })
})

describe('renderHumanReport (quiet verbosity)', () => {
  it('prints nothing on a clean success', () => {
    expect(renderHumanReport(cleanReport, 'quiet')).toBe('')
  })

  it('prints nothing for would-update either (exit 0 is still success)', () => {
    expect(renderHumanReport(wouldUpdateReport, 'quiet')).toBe('')
  })

  it('prints only the conflicting path and the exit code on conflict', () => {
    const text = renderHumanReport(conflictReport, 'quiet')
    expect(text).toBe('eslint: rules.vue/multi-word-component-names\nExit code: 1')
  })
})

describe('renderHumanReport (verbose verbosity)', () => {
  it('also prints the manifest value for a conflict', () => {
    const text = renderHumanReport(conflictReport, 'verbose')
    expect(text).toContain('manifest: "off"')
  })
})

describe('renderHumanReport (whole-project error)', () => {
  it('renders the error message directly, ignoring verbosity', () => {
    const report: ProjectSyncReport = {
      project: null,
      tools: [],
      exitCode: 2,
      error: 'No manifest found at .lintsync/manifest.json. Run `lintsync init` first.',
    }
    expect(renderHumanReport(report, 'quiet')).toBe(
      'Error: No manifest found at .lintsync/manifest.json. Run `lintsync init` first.',
    )
  })
})
