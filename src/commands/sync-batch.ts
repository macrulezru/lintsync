import type { ProjectSyncReport } from '../merge-engine/report.js'
import type { PresetRegistry } from '../presets/types.js'
import { expandHome, listProjects } from '../registry/registry.js'
import { runBatch, type BatchReport } from './batch.js'
import { defaultRegistryPath, loadRegistry } from './projects.js'
import { runSync } from './sync.js'

export interface RunSyncBatchOptions {
  registryPath?: string
  /** Restrict to registered projects carrying this tag (spec 3, e.g. `type:npm-package`). */
  tag?: string
  dryRun: boolean
  yes: boolean
  tool?: string
  presetRegistry: PresetRegistry
}

/**
 * `sync --all` (spec 8/3): runs single-project `sync` once per registered project. Always
 * non-interactive (spec 6: batch mode is the conservative path — no per-project TUI session),
 * so a conflict is reported and left untouched exactly like a non-TTY single-project run.
 */
export async function runSyncBatch(
  options: RunSyncBatchOptions,
): Promise<BatchReport<ProjectSyncReport>> {
  const registry = loadRegistry(options.registryPath ?? defaultRegistryPath())
  const entries = listProjects(registry, options.tag)

  return runBatch(entries, async (entry) => {
    const report = await runSync({
      cwd: expandHome(entry.path),
      dryRun: options.dryRun,
      yes: options.yes,
      interactive: false,
      presetRegistry: options.presetRegistry,
      ...(options.tool ? { tool: options.tool } : {}),
    })
    return { ...report, project: entry.name }
  })
}
