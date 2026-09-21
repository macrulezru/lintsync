import type { ProjectSyncReport } from '../merge-engine/report.js'
import type { PresetRegistry } from '../presets/types.js'
import { expandHome, listProjects } from '../registry/registry.js'
import { runBatch, type BatchReport } from './batch.js'
import { defaultRegistryPath, loadRegistry } from './projects.js'
import { runSync } from './sync.js'

/**
 * `status`'s own exit-code rule (spec 7.5.4): it uses the same engine as `sync --dry-run`, but
 * a conflict or a would-update is a *state of the project*, not a failure of the `status`
 * command — only a genuine execution error (unreadable file, unknown preset, parse failure)
 * makes `status` itself non-zero.
 */
function toStatusExitCode(report: ProjectSyncReport): number {
  if (report.error) {
    return 2
  }
  return report.tools.some((tool) => tool.status === 'error') ? 2 : 0
}

export interface RunStatusOptions {
  cwd: string
  tool?: string
  presetRegistry: PresetRegistry
}

/** `lintsync status` (spec 7.5.4/8): always a dry run, never interactive — it only observes. */
export async function runStatus(options: RunStatusOptions): Promise<ProjectSyncReport> {
  const report = await runSync({
    cwd: options.cwd,
    dryRun: true,
    yes: false,
    interactive: false,
    presetRegistry: options.presetRegistry,
    ...(options.tool ? { tool: options.tool } : {}),
  })
  return { ...report, exitCode: toStatusExitCode(report) }
}

export interface RunStatusBatchOptions {
  registryPath?: string
  tag?: string
  tool?: string
  presetRegistry: PresetRegistry
}

/** `lintsync status --all` (spec 8): status for every registered project (or a tagged subset). */
export async function runStatusBatch(
  options: RunStatusBatchOptions,
): Promise<BatchReport<ProjectSyncReport>> {
  const registry = loadRegistry(options.registryPath ?? defaultRegistryPath())
  const entries = listProjects(registry, options.tag)

  return runBatch(entries, async (entry) => {
    const report = await runStatus({
      cwd: expandHome(entry.path),
      presetRegistry: options.presetRegistry,
      ...(options.tool ? { tool: options.tool } : {}),
    })
    return { ...report, project: entry.name }
  })
}
