import { isCollection, isMap, isScalar, parseDocument, type Document } from 'yaml'
import type { ConfigPath } from './path.js'
import { NOT_FOUND, type ConfigAdapter } from './types.js'

export interface YamlHandle {
  readonly doc: Document.Parsed
}

function toPlainValue(raw: unknown, doc: Document): unknown {
  return isCollection(raw) ? raw.toJS(doc) : raw
}

/**
 * ConfigAdapter for `.yaml`/`.yml` files (spec 7.4.3), built on `yaml` (eemeli)'s mutable
 * `Document` + `setIn`/`deleteIn`/`toString()`, which preserves comments and style for
 * everything outside the edited path — the same point-edit guarantee as the JSON adapter, via
 * a different library.
 *
 * Known limitation carried over from the spec: YAML merge keys (`<<: *anchor`) are not resolved
 * by `getIn`/`hasIn` (only by a separate, unused `merge` option), so a managed key that only
 * exists via a merged anchor reads as NOT_FOUND rather than its merged value. `applyEdits` does
 * not destroy the anchor in that case — it adds an explicit sibling key instead — but the
 * three-way comparison in merge-engine/sync.ts cannot yet tell "defined via merge" apart from
 * "genuinely absent". Full anchor/alias awareness is out of scope for the MVP (spec 7.4.3).
 */
export const yamlAdapter: ConfigAdapter<YamlHandle> = {
  parse(sourceText) {
    return { doc: parseDocument(sourceText) }
  },

  getValueAt(handle, path) {
    const { doc } = handle
    if (path.length === 0) {
      return doc.contents === null ? NOT_FOUND : toPlainValue(doc.getIn([]), doc)
    }
    if (!doc.hasIn([...path])) {
      return NOT_FOUND
    }
    return toPlainValue(doc.getIn([...path]), doc)
  },

  listPaths(handle, prefix) {
    const { doc } = handle
    const node = prefix.length === 0 ? doc.contents : doc.getIn([...prefix])
    if (!isMap(node)) {
      return []
    }
    const paths: ConfigPath[] = []
    for (const pair of node.items) {
      if (isScalar(pair.key)) {
        paths.push([...prefix, String(pair.key.value)])
      }
    }
    return paths
  },

  applyEdits(handle, edits) {
    const doc = handle.doc.clone()
    for (const edit of edits) {
      const yamlPath = [...edit.path]
      if (edit.op === 'set') {
        doc.setIn(yamlPath, edit.value)
      } else {
        doc.deleteIn(yamlPath)
      }
    }
    return doc.toString()
  },
}
