import {
  IndentationText,
  Node,
  Project,
  QuoteKind,
  SyntaxKind,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type SourceFile,
} from 'ts-morph'
import type { ConfigPath } from './path.js'
import { NOT_FOUND, type ConfigAdapter, type JsonValue } from './types.js'

export interface JsHandle {
  readonly sourceText: string
  readonly rootObject: ObjectLiteralExpression | undefined
}

/**
 * Thrown by applyEdits when a path cannot be safely written — spec 7.4.3: "merge-engine never
 * tries to guess the meaning of a non-standard JS expression"; the caller (the `sync` command)
 * is expected to catch this and surface it as a normal per-tool error, not crash.
 */
export class UnsupportedEditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedEditError'
  }
}

// Matches the base stylistic decisions every MVP preset uses (spec section 11): 2-space
// indent, single quotes, trailing commas. Newly inserted properties use this style regardless
// of the file's actual style — existing values are only ever replaced via setInitializer,
// which never touches surrounding whitespace, so this only affects brand-new keys.
function createProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: {
      indentationText: IndentationText.TwoSpaces,
      quoteKind: QuoteKind.Single,
      useTrailingCommas: true,
    },
  })
}

let fileCounter = 0

function findRootObject(sourceFile: SourceFile): ObjectLiteralExpression | undefined {
  const exportAssignment = sourceFile.getExportAssignment((node) => !node.isExportEquals())
  if (exportAssignment) {
    const expression = exportAssignment.getExpression()
    return Node.isObjectLiteralExpression(expression) ? expression : undefined
  }

  for (const statement of sourceFile.getStatements()) {
    if (!Node.isExpressionStatement(statement)) {
      continue
    }
    const expression = statement.getExpression()
    if (!Node.isBinaryExpression(expression) || expression.getOperatorToken().getText() !== '=') {
      continue
    }
    if (expression.getLeft().getText() !== 'module.exports') {
      continue
    }
    const right = expression.getRight()
    if (Node.isObjectLiteralExpression(right)) {
      return right
    }
  }

  return undefined
}

function parseJs(sourceText: string): {
  sourceFile: SourceFile
  rootObject: ObjectLiteralExpression | undefined
} {
  const project = createProject()
  const sourceFile = project.createSourceFile(`lintsync-config-${fileCounter++}.ts`, sourceText)
  return { sourceFile, rootObject: findRootObject(sourceFile) }
}

/** The statically-known key of a property, or undefined for spreads/computed/shorthand/methods. */
function keyOf(property: Node): string | undefined {
  if (!Node.isPropertyAssignment(property)) {
    return undefined
  }
  const nameNode = property.getNameNode()
  if (Node.isStringLiteral(nameNode)) {
    return nameNode.getLiteralValue()
  }
  if (Node.isIdentifier(nameNode) || Node.isNumericLiteral(nameNode)) {
    return nameNode.getText()
  }
  return undefined
}

function findProperty(obj: ObjectLiteralExpression, name: string): PropertyAssignment | undefined {
  for (const property of obj.getProperties()) {
    if (Node.isPropertyAssignment(property) && keyOf(property) === name) {
      return property
    }
  }
  return undefined
}

function navigateToObject(
  root: ObjectLiteralExpression,
  path: ConfigPath,
): ObjectLiteralExpression | undefined {
  let current = root
  for (const segment of path) {
    const property = findProperty(current, segment)
    const initializer = property?.getInitializer()
    if (!initializer || !Node.isObjectLiteralExpression(initializer)) {
      return undefined
    }
    current = initializer
  }
  return current
}

type LiteralResult = { ok: true; value: JsonValue } | { ok: false }

/**
 * Evaluates a node into a JsonValue only if it is a genuine literal (string/number/boolean/
 * null, or an array/object built entirely out of literals) — never a guess at what a dynamic
 * expression (call, identifier reference, spread, template with substitutions) might produce.
 */
function evaluateLiteral(node: Node): LiteralResult {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return { ok: true, value: node.getLiteralValue() }
  }
  if (Node.isNumericLiteral(node)) {
    return { ok: true, value: node.getLiteralValue() }
  }
  if (node.getKind() === SyntaxKind.TrueKeyword) {
    return { ok: true, value: true }
  }
  if (node.getKind() === SyntaxKind.FalseKeyword) {
    return { ok: true, value: false }
  }
  if (node.getKind() === SyntaxKind.NullKeyword) {
    return { ok: true, value: null }
  }
  if (Node.isPrefixUnaryExpression(node) && node.getOperatorToken() === SyntaxKind.MinusToken) {
    const operand = evaluateLiteral(node.getOperand())
    return operand.ok && typeof operand.value === 'number'
      ? { ok: true, value: -operand.value }
      : { ok: false }
  }
  if (Node.isArrayLiteralExpression(node)) {
    const values: JsonValue[] = []
    for (const element of node.getElements()) {
      const evaluated = evaluateLiteral(element)
      if (!evaluated.ok) {
        return { ok: false }
      }
      values.push(evaluated.value)
    }
    return { ok: true, value: values }
  }
  if (Node.isObjectLiteralExpression(node)) {
    const result: Record<string, JsonValue> = {}
    for (const property of node.getProperties()) {
      const key = keyOf(property)
      const initializer = Node.isPropertyAssignment(property)
        ? property.getInitializer()
        : undefined
      if (key === undefined || !initializer) {
        return { ok: false }
      }
      const evaluated = evaluateLiteral(initializer)
      if (!evaluated.ok) {
        return { ok: false }
      }
      result[key] = evaluated.value
    }
    return { ok: true, value: result }
  }
  return { ok: false }
}

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/

function quoteString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function toPropertyName(key: string): string {
  return IDENTIFIER_PATTERN.test(key) ? key : quoteString(key)
}

function literalToSourceText(value: JsonValue): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'string') {
    return quoteString(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(literalToSourceText).join(', ')}]`
  }
  const entries = Object.entries(value).map(
    ([key, v]) => `${toPropertyName(key)}: ${literalToSourceText(v)}`,
  )
  return `{ ${entries.join(', ')} }`
}

function setAtPath(root: ObjectLiteralExpression, path: ConfigPath, value: JsonValue): void {
  if (path.length === 0) {
    throw new UnsupportedEditError('Cannot replace the entire config root')
  }

  let current = root
  for (const segment of path.slice(0, -1)) {
    let property = findProperty(current, segment)
    if (!property) {
      current.addPropertyAssignment({ name: toPropertyName(segment), initializer: '{}' })
      property = findProperty(current, segment)
    }
    const initializer = property?.getInitializer()
    if (!initializer || !Node.isObjectLiteralExpression(initializer)) {
      throw new UnsupportedEditError(
        `Cannot navigate into "${segment}": it is not a plain object literal lintsync can edit`,
      )
    }
    current = initializer
  }

  const lastKey = path[path.length - 1] as string
  const existing = findProperty(current, lastKey)
  if (existing) {
    const initializer = existing.getInitializer()
    if (initializer && !evaluateLiteral(initializer).ok) {
      throw new UnsupportedEditError(
        `Cannot overwrite "${lastKey}": its current value is a dynamic expression, not a literal lintsync can safely replace`,
      )
    }
    existing.setInitializer(literalToSourceText(value))
  } else {
    current.addPropertyAssignment({
      name: toPropertyName(lastKey),
      initializer: literalToSourceText(value),
    })
  }
}

function deleteAtPath(root: ObjectLiteralExpression, path: ConfigPath): void {
  if (path.length === 0) {
    return
  }
  const parent = navigateToObject(root, path.slice(0, -1))
  const lastKey = path[path.length - 1] as string
  findProperty(parent ?? root, lastKey)?.remove()
}

/**
 * ConfigAdapter for flat-config `.js`/`.mjs`/`.ts` files (spec 7.4.3), built on ts-morph. Scope
 * is deliberately narrow, per spec: it only recognizes `export default {...}` or
 * `module.exports = {...}` where the exported value is directly an object literal — an array
 * export, a call-wrapped config (`defineConfig({...})`), or a `satisfies` expression all fall
 * back to "no root object found" rather than guessing. Likewise, only genuinely literal values
 * (string/number/boolean/null and arrays/objects built from them) are ever read or replaced;
 * a dynamic expression (spread, function call, imported variable, template with substitutions)
 * reads as NOT_FOUND and rejects being overwritten with UnsupportedEditError instead of being
 * silently clobbered.
 */
export const jsAdapter: ConfigAdapter<JsHandle> = {
  parse(sourceText) {
    const { rootObject } = parseJs(sourceText)
    return { sourceText, rootObject }
  },

  getValueAt(handle, path) {
    if (!handle.rootObject) {
      return NOT_FOUND
    }
    if (path.length === 0) {
      const evaluated = evaluateLiteral(handle.rootObject)
      return evaluated.ok ? evaluated.value : NOT_FOUND
    }
    const parent = navigateToObject(handle.rootObject, path.slice(0, -1))
    if (!parent) {
      return NOT_FOUND
    }
    const property = findProperty(parent, path[path.length - 1] as string)
    const initializer = property?.getInitializer()
    if (!initializer) {
      return NOT_FOUND
    }
    const evaluated = evaluateLiteral(initializer)
    return evaluated.ok ? evaluated.value : NOT_FOUND
  },

  listPaths(handle, prefix) {
    if (!handle.rootObject) {
      return []
    }
    const target =
      prefix.length === 0 ? handle.rootObject : navigateToObject(handle.rootObject, prefix)
    if (!target) {
      return []
    }
    const paths: ConfigPath[] = []
    for (const property of target.getProperties()) {
      const key = keyOf(property)
      if (key !== undefined) {
        paths.push([...prefix, key])
      }
    }
    return paths
  },

  applyEdits(handle, edits) {
    const { sourceFile, rootObject } = parseJs(handle.sourceText)
    if (!rootObject) {
      throw new UnsupportedEditError(
        'Could not find an `export default {...}` or `module.exports = {...}` object literal to edit',
      )
    }
    for (const edit of edits) {
      if (edit.op === 'set') {
        setAtPath(rootObject, edit.path, edit.value)
      } else {
        deleteAtPath(rootObject, edit.path)
      }
    }
    return sourceFile.getFullText()
  },
}
