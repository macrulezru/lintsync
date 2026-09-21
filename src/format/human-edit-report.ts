import type { GetOutcome, SetOutcome, UnsetOutcome } from '../commands/edit.js'
import { formatPathExpression } from '../merge-engine/path.js'
import type { Verbosity } from './human-report.js'

const formatValue = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value)

/** `get` always prints its result (that's the whole point of the command) — `--quiet` only
 *  suppresses the trailing status line on error, matching set/unset's convention. */
export function renderGetResult(result: GetOutcome, verbosity: Verbosity): string {
  if (!result.found) {
    return verbosity === 'quiet' ? `Код возврата: ${result.exitCode}` : `Ошибка: ${result.error}`
  }
  return formatValue(result.value)
}

export function renderSetResult(result: SetOutcome, verbosity: Verbosity): string {
  if (!result.applied) {
    return verbosity === 'quiet' ? `Код возврата: ${result.exitCode}` : `Ошибка: ${result.error}`
  }
  if (verbosity === 'quiet') {
    return ''
  }
  return `✓ ${formatPathExpression(result.path)} → ${formatValue(result.value)}`
}

export function renderUnsetResult(result: UnsetOutcome, verbosity: Verbosity): string {
  if (!result.applied) {
    return verbosity === 'quiet' ? `Код возврата: ${result.exitCode}` : `Ошибка: ${result.error}`
  }
  if (verbosity === 'quiet') {
    return ''
  }
  return `✓ удалено: ${formatPathExpression(result.path)}`
}
