import type { Preset } from '../presets/types.js'

/** One project in the global registry (spec section 3): a known local repo path plus tags used
 *  to select subsets for batch operations (e.g. `type:npm-package`, `type:site`). */
export interface ProjectEntry {
  name: string
  path: string
  tags: string[]
}

export interface ProjectsRegistry {
  projects: ProjectEntry[]
}

/**
 * User-built presets saved from the interactive `init` constructor (not part of the spec's own
 * MVP — an extension for letting a project's own conventions become a reusable, named preset
 * without publishing an npm package). Stored the same way as the project registry: one JSON file
 * under `~/.lintsync`, global across all projects on the machine.
 */
export interface LocalPresetsFile {
  presets: Preset[]
}
