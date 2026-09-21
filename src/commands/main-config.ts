import { readFileSync } from 'node:fs'
import { parseMainConfig } from '../config/main-config.js'
import { resolveMainConfigPath } from '../config/paths.js'
import type { MainConfig } from '../config/types.js'

/** Loads lintsync's own settings file (see `config/types.ts`). Missing or unreadable is not an
 *  error — same "start from defaults" behavior as the project registry and local presets store
 *  when their own files don't exist yet. */
export function loadMainConfig(configPath: string = resolveMainConfigPath()): MainConfig {
  try {
    return parseMainConfig(readFileSync(configPath, 'utf8'))
  } catch {
    return {}
  }
}
