import type { ConfigPath } from '../merge-engine/path.js'

/** One unresolved conflict to show the user (the shape of merge-engine's SyncConflict). */
export interface ConflictItem {
  path: ConfigPath
  fileValue: unknown
  manifestValue: unknown
  presetValue: unknown
}

export type ResolutionChoice = 'accept-preset' | 'keep-local' | 'manual'

export interface Resolution {
  path: ConfigPath
  choice: ResolutionChoice
  value: unknown
}
