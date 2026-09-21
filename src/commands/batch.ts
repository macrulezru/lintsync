import type { ProjectEntry } from '../registry/types.js'

export interface BatchReport<T extends { exitCode: number }> {
  projects: T[]
  exitCode: number
}

/**
 * Runs one operation per registered project and aggregates the exit codes (spec 7.5.3): 0 if
 * every project is 0, that code if every project shares the same non-zero code, otherwise 3 —
 * so CI can tell "uniformly one thing happened" from "look at each project individually" from
 * the aggregate code alone, without parsing the whole array first.
 */
export async function runBatch<T extends { exitCode: number }>(
  entries: ProjectEntry[],
  runOne: (entry: ProjectEntry) => Promise<T>,
): Promise<BatchReport<T>> {
  const projects: T[] = []
  for (const entry of entries) {
    projects.push(await runOne(entry))
  }

  const codes = new Set(projects.map((project) => project.exitCode))
  let exitCode: number
  if (codes.size === 0) {
    exitCode = 0
  } else if (codes.size === 1) {
    exitCode = [...codes][0] as number
  } else {
    exitCode = 3
  }

  return { projects, exitCode }
}
