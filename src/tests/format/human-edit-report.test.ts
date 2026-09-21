import { describe, expect, it } from 'vitest'
import type { GetOutcome, SetOutcome, UnsetOutcome } from '../../commands/edit.js'
import {
  renderGetResult,
  renderSetResult,
  renderUnsetResult,
} from '../../format/human-edit-report.js'

describe('renderGetResult', () => {
  it('prints a string value bare, without quotes', () => {
    const result: GetOutcome = {
      tool: 'eslint',
      path: ['eslint', 'rules', 'no-console'],
      found: true,
      value: 'warn',
      exitCode: 0,
      error: null,
    }
    expect(renderGetResult(result, 'default')).toBe('warn')
  })

  it('prints a non-string value as JSON', () => {
    const result: GetOutcome = {
      tool: 'prettier',
      path: ['prettier', 'printWidth'],
      found: true,
      value: 100,
      exitCode: 0,
      error: null,
    }
    expect(renderGetResult(result, 'default')).toBe('100')
  })

  it('shows the error message when not found', () => {
    const result: GetOutcome = {
      tool: 'eslint',
      path: ['eslint', 'rules', 'nope'],
      found: false,
      value: undefined,
      exitCode: 2,
      error: 'Path not found: eslint.rules.nope',
    }
    expect(renderGetResult(result, 'default')).toBe('Ошибка: Path not found: eslint.rules.nope')
    expect(renderGetResult(result, 'quiet')).toBe('Код возврата: 2')
  })
})

describe('renderSetResult', () => {
  it('confirms the applied value by default', () => {
    const result: SetOutcome = {
      tool: 'eslint',
      path: ['eslint', 'rules', 'no-console'],
      value: 'warn',
      applied: true,
      exitCode: 0,
      error: null,
    }
    expect(renderSetResult(result, 'default')).toBe('✓ eslint.rules.no-console → warn')
  })

  it('is silent in quiet mode on success', () => {
    const result: SetOutcome = {
      tool: 'eslint',
      path: ['eslint', 'rules', 'no-console'],
      value: 'warn',
      applied: true,
      exitCode: 0,
      error: null,
    }
    expect(renderSetResult(result, 'quiet')).toBe('')
  })

  it('shows the error message on failure', () => {
    const result: SetOutcome = {
      tool: 'eslint',
      path: ['eslint', 'rules', 'no-console'],
      value: 'warn',
      applied: false,
      exitCode: 2,
      error: 'boom',
    }
    expect(renderSetResult(result, 'default')).toBe('Ошибка: boom')
  })
})

describe('renderUnsetResult', () => {
  it('confirms the removal by default', () => {
    const result: UnsetOutcome = {
      tool: 'stylelint',
      path: ['stylelint', 'rules', 'color-no-invalid-hex'],
      applied: true,
      exitCode: 0,
      error: null,
    }
    expect(renderUnsetResult(result, 'default')).toBe(
      '✓ удалено: stylelint.rules.color-no-invalid-hex',
    )
  })

  it('is silent in quiet mode on success', () => {
    const result: UnsetOutcome = {
      tool: 'stylelint',
      path: ['stylelint', 'rules', 'color-no-invalid-hex'],
      applied: true,
      exitCode: 0,
      error: null,
    }
    expect(renderUnsetResult(result, 'quiet')).toBe('')
  })
})
