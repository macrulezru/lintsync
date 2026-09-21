import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addProject,
  expandHome,
  listProjects,
  parseRegistry,
  removeProject,
  serializeRegistry,
} from '../../registry/registry.js'
import type { ProjectsRegistry } from '../../registry/types.js'

describe('registry serialize/parse', () => {
  it('round-trips through serialize/parse', () => {
    const registry: ProjectsRegistry = {
      projects: [{ name: 'vuecraft', path: '~/dev/vuecraft', tags: ['site'] }],
    }
    expect(parseRegistry(serializeRegistry(registry))).toEqual(registry)
  })

  it('serializes with a trailing newline', () => {
    expect(serializeRegistry({ projects: [] }).endsWith('\n')).toBe(true)
  })
})

describe('addProject', () => {
  it('adds a new project', () => {
    const result = addProject(
      { projects: [] },
      { name: 'vuecraft', path: '~/dev/vuecraft', tags: [] },
    )
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.projects).toEqual([{ name: 'vuecraft', path: '~/dev/vuecraft', tags: [] }])
    }
  })

  it('rejects a duplicate name', () => {
    const registry: ProjectsRegistry = { projects: [{ name: 'vuecraft', path: 'a', tags: [] }] }
    const result = addProject(registry, { name: 'vuecraft', path: 'b', tags: [] })
    expect(result).toEqual({ error: 'Project "vuecraft" is already registered' })
  })
})

describe('removeProject', () => {
  it('removes an existing project by name', () => {
    const registry: ProjectsRegistry = {
      projects: [
        { name: 'a', path: 'a', tags: [] },
        { name: 'b', path: 'b', tags: [] },
      ],
    }
    const result = removeProject(registry, 'a')
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.projects).toEqual([{ name: 'b', path: 'b', tags: [] }])
    }
  })

  it('rejects removing an unknown project', () => {
    const result = removeProject({ projects: [] }, 'nope')
    expect(result).toEqual({ error: 'Project "nope" is not registered' })
  })
})

describe('listProjects', () => {
  const registry: ProjectsRegistry = {
    projects: [
      { name: 'vuecraft', path: 'a', tags: ['site'] },
      { name: 'use-viewport', path: 'b', tags: ['npm-package'] },
      { name: 'macrulez', path: 'c', tags: ['site', 'personal'] },
    ],
  }

  it('lists every project when no tag is given', () => {
    expect(listProjects(registry)).toHaveLength(3)
  })

  it('filters by tag', () => {
    expect(listProjects(registry, 'site').map((p) => p.name)).toEqual(['vuecraft', 'macrulez'])
    expect(listProjects(registry, 'npm-package').map((p) => p.name)).toEqual(['use-viewport'])
  })

  it('returns an empty list for an unused tag', () => {
    expect(listProjects(registry, 'does-not-exist')).toEqual([])
  })
})

describe('expandHome', () => {
  it('expands a bare ~ to the real home directory', () => {
    expect(expandHome('~')).toBe(homedir())
  })

  it('expands ~/ prefixed paths against the real home directory', () => {
    expect(expandHome('~/dev/vuecraft')).toBe(join(homedir(), 'dev/vuecraft'))
  })

  it('leaves absolute paths untouched', () => {
    expect(expandHome('/dev/vuecraft')).toBe('/dev/vuecraft')
  })
})
