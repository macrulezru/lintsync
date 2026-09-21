import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { defaultRegistryPath as osDefaultRegistryPath } from '../config/paths.js'
import {
  addProject,
  listProjects,
  parseRegistry,
  removeProject,
  serializeRegistry,
} from '../registry/registry.js'
import type { ProjectEntry, ProjectsRegistry } from '../registry/types.js'
import { loadMainConfig } from './main-config.js'

/** Default location for the global project registry (spec section 3): the main config's own
 *  `registryPath` if it sets one, else the OS-standard config directory (`config/paths.ts`). The
 *  spec also mentions a `lintsync.projects.yaml` alternative without settling on one; JSON is
 *  used here for the same reason section 7.2 gives for the per-project manifest — one format,
 *  no parser ambiguity. */
export function defaultRegistryPath(): string {
  return loadMainConfig().registryPath ?? osDefaultRegistryPath()
}

export function loadRegistry(registryPath: string): ProjectsRegistry {
  try {
    return parseRegistry(readFileSync(registryPath, 'utf8'))
  } catch {
    return { projects: [] }
  }
}

function saveRegistry(registryPath: string, registry: ProjectsRegistry): void {
  mkdirSync(dirname(registryPath), { recursive: true })
  writeFileSync(registryPath, serializeRegistry(registry), 'utf8')
}

export interface ProjectsAddResult {
  project: ProjectEntry | null
  exitCode: number
  error: string | null
}

export function runProjectsAdd(
  registryPath: string,
  name: string,
  path: string,
  tags: string[],
): ProjectsAddResult {
  const registry = loadRegistry(registryPath)
  const result = addProject(registry, { name, path, tags })
  if ('error' in result) {
    return { project: null, exitCode: 2, error: result.error }
  }
  saveRegistry(registryPath, result)
  return { project: { name, path, tags }, exitCode: 0, error: null }
}

export interface ProjectsRemoveResult {
  removed: string | null
  exitCode: number
  error: string | null
}

export function runProjectsRemove(registryPath: string, name: string): ProjectsRemoveResult {
  const registry = loadRegistry(registryPath)
  const result = removeProject(registry, name)
  if ('error' in result) {
    return { removed: null, exitCode: 2, error: result.error }
  }
  saveRegistry(registryPath, result)
  return { removed: name, exitCode: 0, error: null }
}

export interface ProjectsListResult {
  projects: ProjectEntry[]
  exitCode: number
}

export function runProjectsList(registryPath: string, tag?: string): ProjectsListResult {
  const registry = loadRegistry(registryPath)
  return { projects: listProjects(registry, tag), exitCode: 0 }
}
