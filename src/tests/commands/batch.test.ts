import { describe, expect, it } from 'vitest'
import { runBatch } from '../../commands/batch.js'
import type { ProjectEntry } from '../../registry/types.js'

const entries: ProjectEntry[] = [
  { name: 'a', path: '/a', tags: [] },
  { name: 'b', path: '/b', tags: [] },
  { name: 'c', path: '/c', tags: [] },
]

describe('runBatch', () => {
  it('aggregates to 0 when every project is 0', async () => {
    const batch = await runBatch(entries, async (entry) => ({ project: entry.name, exitCode: 0 }))
    expect(batch.exitCode).toBe(0)
    expect(batch.projects.map((p) => p.project)).toEqual(['a', 'b', 'c'])
  })

  it('aggregates to the shared code when every project has the same non-zero code', async () => {
    const batch = await runBatch(entries, async () => ({ exitCode: 1 }))
    expect(batch.exitCode).toBe(1)
  })

  it('aggregates to 3 when projects have differing codes (spec 7.5.3)', async () => {
    const codes = [0, 1, 2]
    let index = 0
    const batch = await runBatch(entries, async () => ({ exitCode: codes[index++] as number }))
    expect(batch.exitCode).toBe(3)
  })

  it('returns exitCode 0 for an empty project list', async () => {
    const batch = await runBatch([], async () => ({ exitCode: 1 }))
    expect(batch).toEqual({ projects: [], exitCode: 0 })
  })

  it('runs projects in order, sequentially', async () => {
    const order: string[] = []
    await runBatch(entries, async (entry) => {
      order.push(entry.name)
      return { exitCode: 0 }
    })
    expect(order).toEqual(['a', 'b', 'c'])
  })
})
