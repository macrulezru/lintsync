#!/usr/bin/env node
import { resolve } from 'node:path'
import { Command } from 'commander'
import { runGet, runSet, runUnset } from './commands/edit.js'
import { runInit } from './commands/init.js'
import {
  defaultLocalPresetsPath,
  loadLocalPresets,
  runListLocalPresets,
  runRemoveLocalPreset,
  runSaveLocalPreset,
} from './commands/local-presets.js'
import { runMigrate } from './commands/migrate.js'
import {
  defaultRegistryPath,
  runProjectsAdd,
  runProjectsList,
  runProjectsRemove,
} from './commands/projects.js'
import { runStatus, runStatusBatch } from './commands/status.js'
import { runSync } from './commands/sync.js'
import { runSyncBatch } from './commands/sync-batch.js'
import { renderHumanBatchReport } from './format/human-batch-report.js'
import { renderGetResult, renderSetResult, renderUnsetResult } from './format/human-edit-report.js'
import { renderHumanInitReport } from './format/human-init-report.js'
import { renderHumanMigrateReport } from './format/human-migrate-report.js'
import { renderPresetsList } from './format/human-presets-report.js'
import { renderProjectsList } from './format/human-projects-report.js'
import { renderHumanReport, type Verbosity } from './format/human-report.js'
import { parsePathExpression, PathParseError } from './merge-engine/path.js'
import { createPresetRegistry } from './presets/composite-registry.js'
import { builtinPresetNames } from './presets/registry.js'
import { promptConfirmOverwrite, promptForInitChoice } from './prompts/init-prompts.js'
import { getVersion } from './version.js'

interface HelpRow {
  indent: number
  label: string
  desc: string
}

function wrapText(text: string, width: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (current && candidate.length > width) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) {
    lines.push(current)
  }
  return lines
}

/**
 * commander's own one-line-per-command "Commands:" list puts a command's own flags inline after
 * its name (`sync [options]`) and leaves their descriptions for a separate `<command> --help`
 * run — fine for a CLI with a couple of flags per command, but it means the top-level `--help`
 * never actually shows what any flag does. This builds a two-level list instead (command, then
 * each of its own options indented below it with its own description), used in place of
 * commander's default via `configureHelp({ visibleCommands: () => [] })` + `addHelpText('after')`
 * on both the top-level program and any command group with its own subcommands (`projects`,
 * `presets`) — same technique as polyrepo-cli's `formatCommandsHelp`.
 */
function formatCommandsHelp(commands: readonly Command[]): string {
  const groups = commands
    .filter((cmd) => cmd.name() !== 'help')
    .map((cmd): HelpRow[] => {
      const aliases = cmd.aliases()
      const label = aliases.length > 0 ? `${cmd.name()}, ${aliases.join(', ')}` : cmd.name()
      return [
        { indent: 0, label, desc: cmd.description() },
        ...cmd.options.map((opt) => ({ indent: 1, label: opt.flags, desc: opt.description })),
      ]
    })

  const allRows = groups.flat()
  const labelWidth = Math.max(...allRows.map((r) => r.indent * 4 + r.label.length))
  const totalWidth = (process.stdout.isTTY && process.stdout.columns) || 96
  const descWidth = Math.max(totalWidth - (2 + labelWidth + 2), 30)

  const lines = ['Commands:']
  groups.forEach((group, i) => {
    if (i > 0) {
      lines.push('')
    }
    for (const row of group) {
      const fullLabel = ' '.repeat(row.indent * 4) + row.label
      const [firstLine, ...restLines] = wrapText(row.desc, descWidth)
      lines.push(`  ${fullLabel.padEnd(labelWidth)}  ${firstLine ?? ''}`)
      for (const cont of restLines) {
        lines.push(`  ${' '.repeat(labelWidth)}  ${cont}`)
      }
    }
  })
  return lines.join('\n')
}

// `--config <path>` is a genuinely global flag (governs where defaultRegistryPath()/
// defaultLocalPresetsPath() look for the main config — see config/paths.ts), so it's consumed
// here by hand, before any command-specific parsing, rather than threaded through every
// command's own options. Setting LINTSYNC_CONFIG lets every later call to loadMainConfig() see
// it transparently; --config is still declared on `program` below purely so it shows in --help.
// A user who places it after a subcommand name (`lintsync sync --config x`) gets commander's own
// "unknown option" error instead, same as any other global CLI flag placed in the wrong spot.
const configFlagIndex = process.argv.indexOf('--config')
if (configFlagIndex !== -1 && process.argv[configFlagIndex + 1]) {
  process.env.LINTSYNC_CONFIG = process.argv[configFlagIndex + 1]
} else {
  const inlineConfigArg = process.argv.find((arg) => arg.startsWith('--config='))
  if (inlineConfigArg) {
    process.env.LINTSYNC_CONFIG = inlineConfigArg.slice('--config='.length)
  }
}

// Loaded once per CLI invocation (each `lintsync` run is its own process, so there's no
// staleness concern) — every command that resolves a preset by name needs to see locally-saved
// presets alongside the 3 built-in ones (composite-registry.ts), not just the built-ins.
const localPresetsPath = defaultLocalPresetsPath()
const localPresets = loadLocalPresets(localPresetsPath).presets
const presetRegistry = createPresetRegistry(localPresets)

const program = new Command()

program.option(
  '--config <path>',
  'path to the main lintsync config file (env: LINTSYNC_CONFIG; default: OS standard config dir); must come before the subcommand name',
)

program
  .name('lintsync')
  .description('Keep ESLint/Prettier/Stylelint configs in sync with a preset')
  .version(getVersion())
  // Hide commander's own one-line-per-command list (see formatCommandsHelp above for why) — the
  // "after" text below replaces it with the two-level version instead of showing both.
  .configureHelp({ visibleCommands: () => [] })
  .addHelpText('after', () => `\n${formatCommandsHelp(program.commands)}`)

program
  .command('sync')
  .description('Sync a project config with its preset')
  .option('--cwd <path>', 'project directory', process.cwd())
  .option('--tool <name>', 'restrict to a single tool from the manifest')
  .option('--all', 'run for every registered project (spec 3), instead of --cwd', false)
  .option('--tag <tag>', 'with --all, restrict to registered projects carrying this tag')
  .option('--registry <path>', 'with --all, path to the project registry (default: see --config)')
  .option('--dry-run', 'preview changes without writing anything', false)
  .option(
    '-y, --yes',
    'apply non-conflicting changes (no interactive confirmation yet, so this is required to write)',
    false,
  )
  .option('--json', 'machine-readable output', false)
  .option('--quiet', 'suppress output on success', false)
  .option('--verbose', 'show extra detail for changes and conflicts', false)
  .action(
    async (options: {
      cwd: string
      tool?: string
      all: boolean
      tag?: string
      registry?: string
      dryRun: boolean
      yes: boolean
      json: boolean
      quiet: boolean
      verbose: boolean
    }) => {
      const verbosity: Verbosity = options.quiet ? 'quiet' : options.verbose ? 'verbose' : 'default'

      if (options.all) {
        // Batch mode is always non-interactive (spec 6) — no per-project TUI session.
        const batch = await runSyncBatch({
          dryRun: options.dryRun,
          yes: options.yes,
          presetRegistry,
          ...(options.tool ? { tool: options.tool } : {}),
          ...(options.tag ? { tag: options.tag } : {}),
          ...(options.registry ? { registryPath: resolve(options.registry) } : {}),
        })
        if (options.json) {
          console.log(JSON.stringify(batch, null, 2))
        } else {
          const text = renderHumanBatchReport(batch, verbosity)
          if (text) {
            console.log(text)
          }
        }
        process.exitCode = batch.exitCode
        return
      }

      // TUI only when there's a real terminal to draw it in and machine output wasn't
      // requested (spec 4.5/12.2 stage 8) — piping/CI/`--json` always take the non-interactive
      // path regardless of TTY-ness.
      const interactive =
        !options.json && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY)

      const report = await runSync({
        cwd: resolve(options.cwd),
        dryRun: options.dryRun,
        yes: options.yes,
        interactive,
        presetRegistry,
        ...(options.tool ? { tool: options.tool } : {}),
      })

      if (options.json) {
        console.log(JSON.stringify(report, null, 2))
      } else {
        const text = renderHumanReport(report, verbosity)
        if (text) {
          console.log(text)
        }
      }

      process.exitCode = report.exitCode
    },
  )

program
  .command('init')
  .description('Install and generate config(s) from a preset (spec 4.1)')
  .argument(
    '[tool]',
    'restrict to a single tool from the preset; omit to init every tool it defines',
  )
  .option('--preset <name>', 'preset to initialize from; prompts interactively if omitted')
  .option('--cwd <path>', 'project directory', process.cwd())
  .option('--force', 'overwrite an existing config file instead of skipping that tool', false)
  .option('--json', 'machine-readable output', false)
  .option('--quiet', 'suppress output on success', false)
  .option('--verbose', 'show extra detail', false)
  .action(
    async (
      tool: string | undefined,
      options: {
        preset?: string
        cwd: string
        force: boolean
        json: boolean
        quiet: boolean
        verbose: boolean
      },
    ) => {
      // Same "no TTY / --json always non-interactive" rule as sync's TUI (spec 4.5/12.2 stage 8).
      const interactive =
        !options.json && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY)

      let presetName = options.preset
      let tools = tool ? [tool] : undefined

      if (!presetName) {
        if (!interactive) {
          console.log(
            options.json
              ? JSON.stringify({
                  error: '--preset is required (no interactive terminal available)',
                })
              : 'Ошибка: --preset is required (no interactive terminal available)',
          )
          process.exitCode = 2
          return
        }
        const choice = await promptForInitChoice(undefined, localPresets)
        if (!choice) {
          process.exitCode = 1
          return
        }
        presetName = choice.presetName
        tools = choice.tools

        if (choice.newPreset) {
          const saveResult = runSaveLocalPreset(localPresetsPath, choice.newPreset, [
            ...builtinPresetNames,
            ...localPresets.map((preset) => preset.name),
          ])
          if (saveResult.error) {
            console.log(
              options.json
                ? JSON.stringify({ error: saveResult.error })
                : `Ошибка: ${saveResult.error}`,
            )
            process.exitCode = 2
            return
          }
        }
      }

      // A just-built preset (choice.newPreset above) isn't in `presetRegistry` yet — it was only
      // just saved to disk this run — so re-derive the registry from the freshest on-disk state
      // rather than reusing the module-scope one computed before this command ran.
      const initPresetRegistry = createPresetRegistry(loadLocalPresets(localPresetsPath).presets)

      const report = await runInit({
        cwd: resolve(options.cwd),
        presetName,
        force: options.force,
        presetRegistry: initPresetRegistry,
        ...(tools ? { tools } : {}),
        ...(interactive
          ? { confirmOverwrite: (t: string, p: string) => promptConfirmOverwrite(t, p) }
          : {}),
      })

      if (options.json) {
        console.log(JSON.stringify(report, null, 2))
      } else {
        const verbosity: Verbosity = options.quiet
          ? 'quiet'
          : options.verbose
            ? 'verbose'
            : 'default'
        const text = renderHumanInitReport(report, verbosity)
        if (text) {
          console.log(text)
        }
      }

      process.exitCode = report.exitCode
    },
  )

program
  .command('get')
  .description('Read one config value: get <tool>.<field...>, e.g. eslint.rules.no-console')
  .argument('<path>', 'bracket-notation path, tool name first, e.g. eslint.rules["no-console"]')
  .option('--cwd <path>', 'project directory', process.cwd())
  .option('--json', 'machine-readable output', false)
  .option('--quiet', 'print only the exit code on error', false)
  .action((pathArg: string, options: { cwd: string; json: boolean; quiet: boolean }) => {
    let path
    try {
      path = parsePathExpression(pathArg)
    } catch (cause) {
      const message = cause instanceof PathParseError ? cause.message : String(cause)
      console.log(options.json ? JSON.stringify({ error: message }) : `Ошибка: ${message}`)
      process.exitCode = 2
      return
    }

    const result = runGet(resolve(options.cwd), path)

    if (options.json) {
      console.log(JSON.stringify(result))
    } else {
      const text = renderGetResult(result, options.quiet ? 'quiet' : 'default')
      if (text) {
        console.log(text)
      }
    }

    process.exitCode = result.exitCode
  })

program
  .command('set')
  .description('Write one config value: set <tool>.<field...> <value> (spec 4.3)')
  .argument('<path>', 'bracket-notation path, tool name first, e.g. eslint.rules.no-console')
  .argument('<value>', 'JSON if it parses as such (100, true, ["warn"]), else a literal string')
  .option('--cwd <path>', 'project directory', process.cwd())
  .option('--json', 'machine-readable output', false)
  .option('--quiet', 'suppress output on success', false)
  .action(
    (
      pathArg: string,
      valueArg: string,
      options: { cwd: string; json: boolean; quiet: boolean },
    ) => {
      let path
      try {
        path = parsePathExpression(pathArg)
      } catch (cause) {
        const message = cause instanceof PathParseError ? cause.message : String(cause)
        console.log(options.json ? JSON.stringify({ error: message }) : `Ошибка: ${message}`)
        process.exitCode = 2
        return
      }

      const result = runSet(resolve(options.cwd), path, valueArg)

      if (options.json) {
        console.log(JSON.stringify(result))
      } else {
        const text = renderSetResult(result, options.quiet ? 'quiet' : 'default')
        if (text) {
          console.log(text)
        }
      }

      process.exitCode = result.exitCode
    },
  )

program
  .command('unset')
  .description('Remove one config field: unset <tool>.<field...> (spec 4.3)')
  .argument(
    '<path>',
    'bracket-notation path, tool name first, e.g. stylelint.rules.color-no-invalid-hex',
  )
  .option('--cwd <path>', 'project directory', process.cwd())
  .option('--json', 'machine-readable output', false)
  .option('--quiet', 'suppress output on success', false)
  .action((pathArg: string, options: { cwd: string; json: boolean; quiet: boolean }) => {
    let path
    try {
      path = parsePathExpression(pathArg)
    } catch (cause) {
      const message = cause instanceof PathParseError ? cause.message : String(cause)
      console.log(options.json ? JSON.stringify({ error: message }) : `Ошибка: ${message}`)
      process.exitCode = 2
      return
    }

    const result = runUnset(resolve(options.cwd), path)

    if (options.json) {
      console.log(JSON.stringify(result))
    } else {
      const text = renderUnsetResult(result, options.quiet ? 'quiet' : 'default')
      if (text) {
        console.log(text)
      }
    }

    process.exitCode = result.exitCode
  })

program
  .command('status')
  .description('Show how far project config(s) have drifted from their preset (spec 7.5.4)')
  .option('--cwd <path>', 'project directory', process.cwd())
  .option('--tool <name>', 'restrict to a single tool from the manifest')
  .option('--all', 'run for every registered project (spec 3), instead of --cwd', false)
  .option('--tag <tag>', 'with --all, restrict to registered projects carrying this tag')
  .option('--registry <path>', 'with --all, path to the project registry (default: see --config)')
  .option('--json', 'machine-readable output', false)
  .option('--quiet', 'suppress output on success', false)
  .option('--verbose', 'show extra detail', false)
  .action(
    async (options: {
      cwd: string
      tool?: string
      all: boolean
      tag?: string
      registry?: string
      json: boolean
      quiet: boolean
      verbose: boolean
    }) => {
      const verbosity: Verbosity = options.quiet ? 'quiet' : options.verbose ? 'verbose' : 'default'

      if (options.all) {
        const batch = await runStatusBatch({
          presetRegistry,
          ...(options.tool ? { tool: options.tool } : {}),
          ...(options.tag ? { tag: options.tag } : {}),
          ...(options.registry ? { registryPath: resolve(options.registry) } : {}),
        })
        if (options.json) {
          console.log(JSON.stringify(batch, null, 2))
        } else {
          const text = renderHumanBatchReport(batch, verbosity)
          if (text) {
            console.log(text)
          }
        }
        process.exitCode = batch.exitCode
        return
      }

      const report = await runStatus({
        cwd: resolve(options.cwd),
        presetRegistry,
        ...(options.tool ? { tool: options.tool } : {}),
      })

      if (options.json) {
        console.log(JSON.stringify(report, null, 2))
      } else {
        const text = renderHumanReport(report, verbosity)
        if (text) {
          console.log(text)
        }
      }

      process.exitCode = report.exitCode
    },
  )

const projects = program
  .command('projects')
  .description('Manage the global project registry (spec 3)')
projects
  .configureHelp({ visibleCommands: () => [] })
  .addHelpText('after', () => `\n${formatCommandsHelp(projects.commands)}`)

projects
  .command('add')
  .description('Register a project')
  .argument('<name>', 'unique name for the project')
  .argument('<path>', 'path to the project directory (may start with ~)')
  .option('--tags <tags>', 'comma-separated tags, e.g. type:npm-package,type:site', '')
  .option('--registry <path>', 'path to the project registry (default: see --config)')
  .option('--json', 'machine-readable output', false)
  .action(
    (name: string, path: string, options: { tags: string; registry?: string; json: boolean }) => {
      const tags = options.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
      const registryPath = options.registry ? resolve(options.registry) : defaultRegistryPath()
      const result = runProjectsAdd(registryPath, name, path, tags)

      if (options.json) {
        console.log(JSON.stringify(result))
      } else if (result.error) {
        console.log(`Ошибка: ${result.error}`)
      } else {
        console.log(`✓ добавлено: ${name} → ${path}`)
      }

      process.exitCode = result.exitCode
    },
  )

projects
  .command('remove')
  .description('Unregister a project')
  .argument('<name>', 'name of the project to remove')
  .option('--registry <path>', 'path to the project registry (default: see --config)')
  .option('--json', 'machine-readable output', false)
  .action((name: string, options: { registry?: string; json: boolean }) => {
    const registryPath = options.registry ? resolve(options.registry) : defaultRegistryPath()
    const result = runProjectsRemove(registryPath, name)

    if (options.json) {
      console.log(JSON.stringify(result))
    } else if (result.error) {
      console.log(`Ошибка: ${result.error}`)
    } else {
      console.log(`✓ удалено: ${name}`)
    }

    process.exitCode = result.exitCode
  })

projects
  .command('list')
  .description('List registered projects')
  .option('--tag <tag>', 'restrict to projects carrying this tag')
  .option('--registry <path>', 'path to the project registry (default: see --config)')
  .option('--json', 'machine-readable output', false)
  .action((options: { tag?: string; registry?: string; json: boolean }) => {
    const registryPath = options.registry ? resolve(options.registry) : defaultRegistryPath()
    const result = runProjectsList(registryPath, options.tag)

    if (options.json) {
      console.log(JSON.stringify(result))
    } else {
      console.log(renderProjectsList(result.projects))
    }

    process.exitCode = result.exitCode
  })

const presets = program
  .command('presets')
  .description('Manage locally-saved presets built via interactive `init`')
presets
  .configureHelp({ visibleCommands: () => [] })
  .addHelpText('after', () => `\n${formatCommandsHelp(presets.commands)}`)

presets
  .command('list')
  .description('List locally-saved presets')
  .option('--presets <path>', 'path to the local presets store (default: see `--config`)')
  .option('--json', 'machine-readable output', false)
  .action((options: { presets?: string; json: boolean }) => {
    const presetsPath = options.presets ? resolve(options.presets) : localPresetsPath
    const result = runListLocalPresets(presetsPath)

    if (options.json) {
      console.log(JSON.stringify(result))
    } else {
      console.log(renderPresetsList(result.presets))
    }

    process.exitCode = result.exitCode
  })

presets
  .command('remove')
  .description('Delete a locally-saved preset')
  .argument('<name>', 'name of the preset to remove')
  .option('--presets <path>', 'path to the local presets store (default: see `--config`)')
  .option('--json', 'machine-readable output', false)
  .action((name: string, options: { presets?: string; json: boolean }) => {
    const presetsPath = options.presets ? resolve(options.presets) : localPresetsPath
    const result = runRemoveLocalPreset(presetsPath, name)

    if (options.json) {
      console.log(JSON.stringify(result))
    } else if (result.error) {
      console.log(`Ошибка: ${result.error}`)
    } else {
      console.log(`✓ удалено: ${name}`)
    }

    process.exitCode = result.exitCode
  })

program
  .command('migrate')
  .description('Convert a legacy config to a new format/location (spec 4.4)')
  .argument('<tool>', 'eslint, prettier, or stylelint')
  .requiredOption(
    '--to <format>',
    'target format: "flat" for eslint; "json"/"yaml"/"js" for prettier/stylelint',
  )
  .option('--cwd <path>', 'project directory', process.cwd())
  .option('--json', 'machine-readable output', false)
  .option('--quiet', 'suppress output on success', false)
  .action((tool: string, options: { to: string; cwd: string; json: boolean; quiet: boolean }) => {
    const report = runMigrate({ cwd: resolve(options.cwd), tool, to: options.to })

    if (options.json) {
      console.log(JSON.stringify(report))
    } else {
      const text = renderHumanMigrateReport(report, options.quiet ? 'quiet' : 'default')
      if (text) {
        console.log(text)
      }
    }

    process.exitCode = report.exitCode
  })

program.parse(process.argv)
