import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ProjectEntry, ProjectsRegistry } from './types.js'

export function parseRegistry(text: string): ProjectsRegistry {
  return JSON.parse(text) as ProjectsRegistry
}

export function serializeRegistry(registry: ProjectsRegistry): string {
  return `${JSON.stringify(registry, null, 2)}\n`
}

export interface RegistryError {
  error: string
}

/** Registers a project, keyed by name (spec section 3's `lintsync projects add`). */
export function addProject(
  registry: ProjectsRegistry,
  entry: ProjectEntry,
): ProjectsRegistry | RegistryError {
  if (registry.projects.some((project) => project.name === entry.name)) {
    return { error: `Project "${entry.name}" is already registered` }
  }
  return { projects: [...registry.projects, entry] }
}

export function removeProject(
  registry: ProjectsRegistry,
  name: string,
): ProjectsRegistry | RegistryError {
  if (!registry.projects.some((project) => project.name === name)) {
    return { error: `Project "${name}" is not registered` }
  }
  return { projects: registry.projects.filter((project) => project.name !== name) }
}

/** Lists registered projects, optionally filtered to one tag (spec 3: batch subsets by tag). */
export function listProjects(registry: ProjectsRegistry, tag?: string): ProjectEntry[] {
  return tag ? registry.projects.filter((project) => project.tags.includes(tag)) : registry.projects
}

/**
 * Expands a leading `~` to the home directory. The registry stores paths as given (spec 3's own
 * example: `"path": "~/dev/vuecraft"`) so the file stays portable/readable; this is applied only
 * when actually turning an entry into a real filesystem path to operate on.
 */
export function expandHome(path: string): string {
  if (path === '~') {
    return homedir()
  }
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return join(homedir(), path.slice(2))
  }
  return path
}
