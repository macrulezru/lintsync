#!/usr/bin/env node
import { resolve } from 'node:path'
import { Command } from 'commander'
import { runGet, runSet, runUnset } from './commands/edit.js'
import { runInit } from './commands/init.js'
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
import { renderProjectsList } from './format/human-projects-report.js'
import { renderHumanReport, type Verbosity } from './format/human-report.js'
import { parsePathExpression, PathParseError } from './merge-engine/path.js'
import { builtinPresets } from './presets/registry.js'
import { getVersion } from './version.js'

const program = new Command()

program
  .name('lintsync')
  .description('Keep ESLint/Prettier/Stylelint configs in sync with a preset')
  .version(getVersion())

program
  .command('sync')
  .description('Sync a project config with its preset')
  .option('--cwd <path>', 'project directory', process.cwd())
  .option('--tool <name>', 'restrict to a single tool from the manifest')
  .option('--all', 'run for every registered project (spec 3), instead of --cwd', false)
  .option('--tag <tag>', 'with --all, restrict to registered projects carrying this tag')
  .option(
    '--registry <path>',
    'with --all, path to the project registry (default: ~/.lintsync/projects.json)',
  )
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
          presetRegistry: builtinPresets,
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
        presetRegistry: builtinPresets,
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
  .requiredOption('--preset <name>', 'preset to initialize from')
  .option('--cwd <path>', 'project directory', process.cwd())
  .option('--force', 'overwrite an existing config file instead of skipping that tool', false)
  .option('--json', 'machine-readable output', false)
  .option('--quiet', 'suppress output on success', false)
  .option('--verbose', 'show extra detail', false)
  .action(
    async (
      tool: string | undefined,
      options: {
        preset: string
        cwd: string
        force: boolean
        json: boolean
        quiet: boolean
        verbose: boolean
      },
    ) => {
      const report = await runInit({
        cwd: resolve(options.cwd),
        presetName: options.preset,
        force: options.force,
        presetRegistry: builtinPresets,
        ...(tool ? { tool } : {}),
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
  .option(
    '--registry <path>',
    'with --all, path to the project registry (default: ~/.lintsync/projects.json)',
  )
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
          presetRegistry: builtinPresets,
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
        presetRegistry: builtinPresets,
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
  .command('add')
  .description('Register a project')
  .argument('<name>', 'unique name for the project')
  .argument('<path>', 'path to the project directory (may start with ~)')
  .option('--tags <tags>', 'comma-separated tags, e.g. type:npm-package,type:site', '')
  .option('--registry <path>', 'path to the project registry (default: ~/.lintsync/projects.json)')
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
  .option('--registry <path>', 'path to the project registry (default: ~/.lintsync/projects.json)')
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
  .option('--registry <path>', 'path to the project registry (default: ~/.lintsync/projects.json)')
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
