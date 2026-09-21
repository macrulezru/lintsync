import type { ConfigPath } from './path.js'

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/** Sentinel distinguishing "path does not exist in the file" from a real `null`/`undefined` value. */
export const NOT_FOUND = Symbol('NOT_FOUND')
export type NotFound = typeof NOT_FOUND

export type ConfigEdit =
  { op: 'set'; path: ConfigPath; value: JsonValue } | { op: 'delete'; path: ConfigPath }

/**
 * Format-agnostic interface hiding the concrete parser library behind each config format
 * (spec section 7.4.2). merge-engine's sync/set/get/unset logic talks only to this
 * interface, never to jsonc-parser/yaml/ts-morph directly.
 */
export interface ConfigAdapter<Handle = unknown> {
  /** Parses source text into a working handle (the concrete AST/CST of the underlying library). */
  parse(sourceText: string): Handle

  /** Reads the value at path, or NOT_FOUND if the path does not exist in the file. */
  getValueAt(handle: Handle, path: ConfigPath): unknown | NotFound

  /** Lists paths actually present in the file directly under the given prefix (for wildcard managedKeys). */
  listPaths(handle: Handle, prefix: ConfigPath): ConfigPath[]

  /** Applies a batch of point edits and returns the new file text, preserving formatting elsewhere. */
  applyEdits(handle: Handle, edits: ConfigEdit[]): string
}
