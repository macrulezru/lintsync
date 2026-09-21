import { extname } from 'node:path'
import { jsAdapter } from '../merge-engine/js-adapter.js'
import { jsonAdapter } from '../merge-engine/json-adapter.js'
import type { ConfigAdapter } from '../merge-engine/types.js'
import { yamlAdapter } from '../merge-engine/yaml-adapter.js'

/** Picks the ConfigAdapter for a config file by extension — shared by `sync` and `init` so both
 *  agree on which formats are supported (spec 7.4.3's adapter matrix). */
export function pickAdapter(configPath: string): ConfigAdapter | undefined {
  const ext = extname(configPath).toLowerCase()
  if (ext === '.json' || ext === '.jsonc') {
    return jsonAdapter
  }
  if (ext === '.yaml' || ext === '.yml') {
    return yamlAdapter
  }
  if (
    ext === '.js' ||
    ext === '.mjs' ||
    ext === '.cjs' ||
    ext === '.ts' ||
    ext === '.mts' ||
    ext === '.cts'
  ) {
    return jsAdapter
  }
  return undefined
}
