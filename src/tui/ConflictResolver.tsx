import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import { formatPathExpression } from '../merge-engine/path.js'
import type { ConflictItem, Resolution, ResolutionChoice } from './types.js'

export interface ConflictResolverProps {
  conflicts: ConflictItem[]
  onComplete: (resolutions: Resolution[]) => void
}

const OPTIONS: ReadonlyArray<{ choice: ResolutionChoice; label: string }> = [
  { choice: 'accept-preset', label: 'Принять эталон' },
  { choice: 'keep-local', label: 'Оставить локальное' },
  { choice: 'manual', label: 'Отредактировать вручную' },
]

function formatValue(value: unknown): string {
  return JSON.stringify(value)
}

function parseManualInput(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

/**
 * Spike TUI for resolving sync conflicts (spec 4.5/5, 12.2 stage 7): arrow-key pagination
 * across conflicts, a 3-way diff (local/manifest/preset) per page, a choice of accept
 * preset/keep local/edit manually, and a live preview of the value that choice would produce.
 * Deliberately NOT wired to the real merge-engine yet (that's stage 8) — it only knows about
 * the plain ConflictItem/Resolution shapes in ./types.ts.
 */
export function ConflictResolver({ conflicts, onComplete }: ConflictResolverProps) {
  const [pageIndex, setPageIndex] = useState(0)
  const [cursor, setCursor] = useState(0)
  const [resolutions, setResolutions] = useState<Array<Resolution | undefined>>(() =>
    conflicts.map(() => undefined),
  )
  const [manualMode, setManualMode] = useState(false)
  const [manualInput, setManualInput] = useState('')

  const conflict = conflicts[pageIndex]

  // Keep the option cursor in sync with whatever was already chosen for this page, so
  // revisiting a resolved page shows its current answer rather than always resetting to 0.
  useEffect(() => {
    const existing = resolutions[pageIndex]
    setCursor(existing ? OPTIONS.findIndex((option) => option.choice === existing.choice) : 0)
    setManualMode(false)
    // Intentionally only re-runs on page change; `resolutions` is read, not depended on, to
    // avoid re-syncing the cursor every time a resolution is recorded on the current page.
  }, [pageIndex])

  function commit(choice: ResolutionChoice, value: unknown): void {
    if (!conflict) {
      return
    }
    const next = [...resolutions]
    next[pageIndex] = { path: conflict.path, choice, value }
    setResolutions(next)

    if (next.every((resolution) => resolution !== undefined)) {
      onComplete(next as Resolution[])
      return
    }

    const nextUnresolved = next.findIndex((resolution) => resolution === undefined)
    if (nextUnresolved !== -1) {
      setPageIndex(nextUnresolved)
    }
  }

  useInput((input, key) => {
    if (!conflict) {
      return
    }

    if (manualMode) {
      if (key.return) {
        commit('manual', parseManualInput(manualInput))
        setManualMode(false)
        return
      }
      if (key.escape) {
        setManualMode(false)
        return
      }
      if (key.backspace || key.delete) {
        setManualInput((value) => value.slice(0, -1))
        return
      }
      if (input) {
        setManualInput((value) => value + input)
      }
      return
    }

    if (key.leftArrow) {
      setPageIndex((index) => Math.max(0, index - 1))
      return
    }
    if (key.rightArrow) {
      setPageIndex((index) => Math.min(conflicts.length - 1, index + 1))
      return
    }
    if (key.upArrow) {
      setCursor((index) => (index - 1 + OPTIONS.length) % OPTIONS.length)
      return
    }
    if (key.downArrow) {
      setCursor((index) => (index + 1) % OPTIONS.length)
      return
    }
    if (key.return) {
      const option = OPTIONS[cursor]
      if (!option) {
        return
      }
      if (option.choice === 'manual') {
        const existing = resolutions[pageIndex]
        setManualInput(
          existing?.choice === 'manual'
            ? formatValue(existing.value)
            : formatValue(conflict.fileValue),
        )
        setManualMode(true)
        return
      }
      commit(
        option.choice,
        option.choice === 'accept-preset' ? conflict.presetValue : conflict.fileValue,
      )
    }
  })

  if (!conflict) {
    return null
  }

  const highlighted = OPTIONS[cursor]
  const previewValue = manualMode
    ? parseManualInput(manualInput)
    : highlighted?.choice === 'accept-preset'
      ? conflict.presetValue
      : highlighted?.choice === 'keep-local'
        ? conflict.fileValue
        : (resolutions[pageIndex]?.value ?? conflict.fileValue)

  return (
    <Box flexDirection="column">
      <Text>
        Конфликт {pageIndex + 1}/{conflicts.length}: {formatPathExpression(conflict.path)}
      </Text>
      <Text> Локально: {formatValue(conflict.fileValue)}</Text>
      <Text> Манифест (было): {formatValue(conflict.manifestValue)}</Text>
      <Text> Эталон (стало): {formatValue(conflict.presetValue)}</Text>
      <Box flexDirection="column" marginTop={1}>
        {OPTIONS.map((option, index) => (
          <Text key={option.choice} {...(index === cursor ? { color: 'cyan' } : {})}>
            {index === cursor ? '▸ ' : '  '}
            {option.label}
            {resolutions[pageIndex]?.choice === option.choice ? ' ✓' : ''}
          </Text>
        ))}
      </Box>
      {manualMode ? (
        <Text>Ввод: {manualInput}</Text>
      ) : (
        <Text dimColor>Предпросмотр: {formatValue(previewValue)}</Text>
      )}
    </Box>
  )
}
