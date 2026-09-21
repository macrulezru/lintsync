/**
 * Path model for merge-engine (spec section 7.4.1).
 *
 * A ConfigPath is a segment array, never a dot-joined string: rule names such as
 * `@typescript-eslint/no-unused-vars` or `vue/multi-word-component-names` may themselves
 * contain characters that would make a dot-string representation ambiguous.
 */
export type ConfigPath = readonly string[]

export class PathParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathParseError'
  }
}

/**
 * Parses the CLI bracket-notation path syntax (lodash/JS-property-access style) into a
 * ConfigPath. Used for both concrete paths (`set`/`get` arguments) and patterns
 * (`managedKeys` in presets, where a `*` segment stands for "any single segment here").
 */
export function parsePathExpression(input: string): ConfigPath {
  if (input.length === 0) {
    throw new PathParseError('Path expression cannot be empty')
  }

  const segments: string[] = []
  let i = 0
  const len = input.length

  const readBareSegment = (): string => {
    const start = i
    while (i < len && input[i] !== '.' && input[i] !== '[' && input[i] !== ']') {
      i++
    }
    if (i === start) {
      throw new PathParseError(
        `Unexpected character '${input[i]}' at position ${i} in path "${input}"`,
      )
    }
    return input.slice(start, i)
  }

  const readBracketSegment = (): string => {
    i++ // consume '['
    const quote = input[i]
    if (quote !== '"' && quote !== "'") {
      throw new PathParseError(
        `Expected a quote ('"' or "'") after '[' at position ${i} in path "${input}"`,
      )
    }
    i++ // consume opening quote
    const start = i
    while (i < len && input[i] !== quote) {
      i++
    }
    if (i >= len) {
      throw new PathParseError(`Unterminated string literal in path "${input}"`)
    }
    const value = input.slice(start, i)
    i++ // consume closing quote
    if (input[i] !== ']') {
      throw new PathParseError(`Expected ']' at position ${i} in path "${input}"`)
    }
    i++ // consume ']'
    return value
  }

  if (input[i] === '.') {
    throw new PathParseError(`Path cannot start with '.' in path "${input}"`)
  }
  segments.push(input[i] === '[' ? readBracketSegment() : readBareSegment())

  while (i < len) {
    if (input[i] === '.') {
      i++
      if (input[i] === '[' || input[i] === '.' || i >= len) {
        throw new PathParseError(
          `Unexpected character after '.' at position ${i} in path "${input}"`,
        )
      }
      segments.push(readBareSegment())
    } else if (input[i] === '[') {
      segments.push(readBracketSegment())
    } else {
      throw new PathParseError(
        `Unexpected character '${input[i]}' at position ${i} in path "${input}"`,
      )
    }
  }

  return segments
}

const isBareSafe = (segment: string): boolean =>
  segment.length > 0 && !segment.includes('.') && !segment.includes('[') && !segment.includes(']')

/** Inverse of parsePathExpression, used for error messages and diff/TUI output. */
export function formatPathExpression(path: ConfigPath): string {
  if (path.length === 0) {
    throw new PathParseError('Cannot format an empty path')
  }
  return path
    .map((segment, index) => {
      if (isBareSafe(segment)) {
        return index === 0 ? segment : `.${segment}`
      }
      return `[${JSON.stringify(segment)}]`
    })
    .join('')
}

/**
 * Matches a concrete path against a managedKeys-style pattern. A `*` segment in the
 * pattern matches exactly one arbitrary segment at that position (spec 7.1: "все ключи
 * внутри rules" via `rules.*`) — it is not a recursive/multi-segment glob.
 */
export function matchesPattern(pattern: ConfigPath, path: ConfigPath): boolean {
  if (pattern.length !== path.length) {
    return false
  }
  return pattern.every((segment, index) => segment === '*' || segment === path[index])
}
