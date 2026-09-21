import {
  applyEdits as applyJsoncEdits,
  findNodeAtLocation,
  getNodeValue,
  modify,
  parseTree,
  type Node,
} from 'jsonc-parser'
import type { ConfigPath } from './path.js'
import { NOT_FOUND, type ConfigAdapter } from './types.js'

export interface JsonHandle {
  readonly sourceText: string
  readonly root: Node | undefined
}

const FORMATTING_OPTIONS = { insertSpaces: true, tabSize: 2 }

/**
 * ConfigAdapter for `.json`/`.jsonc` files (spec 7.4.3), built on jsonc-parser's point-edit
 * API (`modify` + `applyEdits`) rather than reformatting the whole file on every change.
 * Also used for `package.json` sections (e.g. `eslintConfig`) with a fixed root prefix.
 */
export const jsonAdapter: ConfigAdapter<JsonHandle> = {
  parse(sourceText) {
    return { sourceText, root: parseTree(sourceText) }
  },

  getValueAt(handle, path) {
    if (!handle.root) {
      return NOT_FOUND
    }
    const node = path.length === 0 ? handle.root : findNodeAtLocation(handle.root, [...path])
    return node === undefined ? NOT_FOUND : getNodeValue(node)
  },

  listPaths(handle, prefix) {
    if (!handle.root) {
      return []
    }
    const node = prefix.length === 0 ? handle.root : findNodeAtLocation(handle.root, [...prefix])
    if (node === undefined || node.type !== 'object' || !node.children) {
      return []
    }
    const paths: ConfigPath[] = []
    for (const property of node.children) {
      const keyNode = property.children?.[0]
      if (property.type === 'property' && keyNode?.type === 'string') {
        paths.push([...prefix, String(keyNode.value)])
      }
    }
    return paths
  },

  applyEdits(handle, edits) {
    let text = handle.sourceText
    for (const edit of edits) {
      const jsonPath: (string | number)[] = [...edit.path]
      const value = edit.op === 'set' ? edit.value : undefined
      const jsoncEdits = modify(text, jsonPath, value, { formattingOptions: FORMATTING_OPTIONS })
      text = applyJsoncEdits(text, jsoncEdits)
    }
    return text
  },
}
