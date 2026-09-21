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
