import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { detect, type Agent } from 'package-manager-detector'
import { resolveCommand } from 'package-manager-detector/commands'
import { jsonAdapter } from '../merge-engine/json-adapter.js'
import {
  parseManifest,
  serializeManifest,
  type Manifest,
  type ManifestEntry,
} from '../merge-engine/manifest.js'
import { syncTool } from '../merge-engine/sync.js'
import type { ConfigEdit } from '../merge-engine/types.js'
import { generateInitialConfig } from '../presets/generate-config.js'
import { toPresetSnapshot } from '../presets/snapshot.js'
import type { PresetRegistry } from '../presets/types.js'
import { pickAdapter } from './pick-adapter.js'

const MANIFEST_RELATIVE_PATH = join('.lintsync', 'manifest.json')

export interface RunInitOptions {
  cwd: string
  presetName: string
  /** Restrict to a single tool from the preset (spec 4.1: `init [tool] --preset=<name>`). */
  tool?: string
  /** Overwrite an existing config file instead of skipping that tool (spec 4.1). */
  force: boolean
  presetRegistry: PresetRegistry
  /**
   * Installs dev dependencies via the detected package manager; defaults to a real
   * `npm/pnpm/yarn install -D ...` child process. Injectable so tests never touch the network,
   * matching how `sync`'s TUI resolver is injected (spec stage 8).
   */
  installDependencies?: (agent: Agent, packages: string[], cwd: string) => Promise<void>
}

export interface InitToolReport {
  tool: string
  configPath: string
  status: 'created' | 'skipped' | 'error'
  message: string | null
}

export interface ProjectInitReport {
  preset: { name: string; version: string } | null
  tools: InitToolReport[]
  dependenciesInstalled: string[]
  scriptsUpdated: string[]
  exitCode: number
  error: string | null
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function errorReport(message: string): ProjectInitReport {
  return {
    preset: null,
    tools: [],
    dependenciesInstalled: [],
    scriptsUpdated: [],
    exitCode: 2,
    error: message,
  }
}

/** Resolves the install command via package-manager-detector's own agent/command tables (spec
 *  4.1: install through the detected package manager, never by hand-editing package.json) and
 *  runs it as a real child process. */
async function defaultInstallDependencies(
  agent: Agent,
  packages: string[],
  cwd: string,
): Promise<void> {
  const resolved = resolveCommand(agent, 'add', ['-D', ...packages])
  if (!resolved) {
    throw new Error(`Could not resolve an install command for package manager "${agent}"`)
  }
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(resolved.command, resolved.args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise()
      } else {
        reject(
          new Error(`\`${resolved.command} ${resolved.args.join(' ')}\` exited with code ${code}`),
        )
      }
    })
  })
}

/**
 * Runs `init` for one project directory (spec 12.2 stage 9): generates each tool's config from
 * the preset (via generate-config.ts + the same merge-engine adapters `sync` uses), records
 * ownership in `.lintsync/manifest.json`, wires the `lint`/`lint:fix`/`format` npm scripts, and
 * installs the preset's dependencies through the detected package manager. Without `tool`, every
 * tool the preset defines is initialized in one pass (spec 4.1); an existing config file is left
 * untouched (and that tool skipped, not the whole run aborted) unless `--force` is given.
 */
export async function runInit(options: RunInitOptions): Promise<ProjectInitReport> {
  const preset = options.presetRegistry.getPreset(options.presetName)
  if (!preset) {
    return errorReport(`Preset "${options.presetName}" is not registered`)
  }

  let toolNames: string[]
  if (options.tool) {
    if (!preset.tools[options.tool]) {
      return errorReport(`Preset "${preset.name}" does not define tool "${options.tool}"`)
    }
    toolNames = [options.tool]
  } else {
    toolNames = Object.keys(preset.tools)
  }

  const toolReports: InitToolReport[] = []
  const manifestUpdates: Record<
    string,
    { configPath: string; managed: Record<string, ManifestEntry> }
  > = {}
  const dependencySet = new Set<string>()
  let sawError = false

  for (const toolName of toolNames) {
    const toolDef = preset.tools[toolName]
    if (!toolDef) {
      continue
    }

    const configAbsPath = join(options.cwd, toolDef.configFileName)
    if (existsSync(configAbsPath) && !options.force) {
      toolReports.push({
        tool: toolName,
        configPath: toolDef.configFileName,
        status: 'skipped',
        message: 'Config already exists (use --force to overwrite)',
      })
      continue
    }

    const adapter = pickAdapter(toolDef.configFileName)
    if (!adapter) {
      toolReports.push({
        tool: toolName,
        configPath: toolDef.configFileName,
        status: 'error',
        message: `Unsupported config format for "${toolDef.configFileName}"`,
      })
      sawError = true
      continue
    }

    let text: string
    try {
      text = generateInitialConfig(preset, toolDef)
      writeFileSync(configAbsPath, text, 'utf8')
    } catch (cause) {
      toolReports.push({
        tool: toolName,
        configPath: toolDef.configFileName,
        status: 'error',
        message: toErrorMessage(cause),
      })
      sawError = true
      continue
    }

    // Freshly generated straight from the preset's own values -> always 'clean', with a full
    // per-key manifest baseline (reusing syncTool rather than hand-rolling the same logic).
    const presetSnapshot = toPresetSnapshot(preset, toolDef)
    const planted = syncTool({
      adapter,
      fileText: text,
      preset: presetSnapshot,
      manifestManaged: {},
      dryRun: true,
    })
    manifestUpdates[toolName] = {
      configPath: toolDef.configFileName,
      managed: planted.updatedManaged,
    }

    for (const dependency of toolDef.dependencies) {
      dependencySet.add(dependency)
    }
    toolReports.push({
      tool: toolName,
      configPath: toolDef.configFileName,
      status: 'created',
      message: null,
    })
  }

  const createdToolNames = Object.keys(manifestUpdates)

  if (createdToolNames.length > 0) {
    const manifestPath = join(options.cwd, MANIFEST_RELATIVE_PATH)
    let manifest: Manifest = {}
    try {
      manifest = parseManifest(readFileSync(manifestPath, 'utf8'))
    } catch {
      // No existing manifest yet (or it's unreadable) -- start fresh rather than fail init over it.
    }
    const nextManifest: Manifest = { ...manifest }
    for (const toolName of createdToolNames) {
      const update = manifestUpdates[toolName]
      if (!update) {
        continue
      }
      nextManifest[toolName] = {
        preset: preset.name,
        version: preset.version,
        configPath: update.configPath,
        managed: update.managed,
      }
    }
    mkdirSync(join(options.cwd, '.lintsync'), { recursive: true })
    writeFileSync(manifestPath, serializeManifest(nextManifest), 'utf8')
  }

  const scriptsUpdated: string[] = []
  const scriptEdits: ConfigEdit[] = []
  if (createdToolNames.includes('eslint')) {
    scriptEdits.push({ op: 'set', path: ['scripts', 'lint'], value: 'eslint .' })
    scriptEdits.push({ op: 'set', path: ['scripts', 'lint:fix'], value: 'eslint . --fix' })
    scriptsUpdated.push('lint', 'lint:fix')
  }
  if (createdToolNames.includes('prettier')) {
    scriptEdits.push({ op: 'set', path: ['scripts', 'format'], value: 'prettier --write .' })
    scriptsUpdated.push('format')
  }
  if (scriptEdits.length > 0) {
    try {
      const pkgPath = join(options.cwd, 'package.json')
      const pkgText = readFileSync(pkgPath, 'utf8')
      const newPkgText = jsonAdapter.applyEdits(jsonAdapter.parse(pkgText), scriptEdits)
      writeFileSync(pkgPath, newPkgText, 'utf8')
    } catch {
      // No package.json (or it's unreadable) to add scripts to -- non-fatal, configs/manifest
      // already succeeded; report reflects that no scripts were actually written.
      scriptsUpdated.length = 0
    }
  }

  const dependenciesInstalled: string[] = []
  if (dependencySet.size > 0) {
    const detected = await detect({ cwd: options.cwd })
    const agent: Agent = detected?.agent ?? 'npm'
    const install = options.installDependencies ?? defaultInstallDependencies
    const packages = [...dependencySet].sort()
    try {
      await install(agent, packages, options.cwd)
      dependenciesInstalled.push(...packages)
    } catch (cause) {
      return {
        preset: { name: preset.name, version: preset.version },
        tools: toolReports,
        dependenciesInstalled,
        scriptsUpdated,
        exitCode: 2,
        error: `Dependency installation failed: ${toErrorMessage(cause)}`,
      }
    }
  }

  return {
    preset: { name: preset.name, version: preset.version },
    tools: toolReports,
    dependenciesInstalled,
    scriptsUpdated,
    exitCode: sawError ? 2 : 0,
    error: null,
  }
}
