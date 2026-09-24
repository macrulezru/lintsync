import { describe, expect, it } from 'vitest'
import type { ProjectInitReport } from '../../commands/init.js'
import { renderHumanInitReport } from '../../format/human-init-report.js'

const successReport: ProjectInitReport = {
  preset: { name: 'vue-app', version: '0.1.0' },
  tools: [
    { tool: 'eslint', configPath: 'eslint.config.js', status: 'created', message: null },
    { tool: 'prettier', configPath: '.prettierrc.json', status: 'created', message: null },
    {
      tool: 'stylelint',
      configPath: '.stylelintrc.json',
      status: 'skipped',
      message: 'Config already exists (use --force to overwrite)',
    },
  ],
  dependenciesInstalled: ['eslint', 'prettier'],
  scriptsUpdated: ['lint', 'lint:fix', 'format'],
  exitCode: 0,
  error: null,
}

const errorReport: ProjectInitReport = {
  preset: null,
  tools: [],
  dependenciesInstalled: [],
  scriptsUpdated: [],
  exitCode: 2,
  error: 'Preset "vue-app" is not registered',
}

describe('renderHumanInitReport (default verbosity)', () => {
  it('shows each tool with an icon and status, plus dependencies/scripts summary', () => {
    const text = renderHumanInitReport(successReport, 'default')
    expect(text).toContain('preset vue-app@0.1.0')
    expect(text).toContain('✓ eslint (eslint.config.js) — created')
    expect(text).toContain('✓ prettier (.prettierrc.json) — created')
    expect(text).toContain('⏭ stylelint (.stylelintrc.json) — skipped: Config already exists')
    expect(text).toContain('2 packages installed: eslint, prettier')
    expect(text).toContain('npm scripts updated: lint, lint:fix, format')
    expect(text).toContain('Total: 2 created, 1 skipped. Exit code: 0')
  })
})

describe('renderHumanInitReport (quiet verbosity)', () => {
  it('prints nothing on success', () => {
    expect(renderHumanInitReport(successReport, 'quiet')).toBe('')
  })

  it('prints per-tool errors and the exit code on failure', () => {
    const report: ProjectInitReport = {
      ...successReport,
      exitCode: 2,
      tools: [{ tool: 'eslint', configPath: 'eslint.config.js', status: 'error', message: 'boom' }],
    }
    expect(renderHumanInitReport(report, 'quiet')).toBe('eslint: boom\nExit code: 2')
  })
})

describe('renderHumanInitReport (whole-run error)', () => {
  it('renders the error message directly, ignoring verbosity', () => {
    expect(renderHumanInitReport(errorReport, 'default')).toBe(
      'Error: Preset "vue-app" is not registered',
    )
  })
})
