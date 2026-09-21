#!/usr/bin/env node
import { resolve } from 'node:path'
import { Command } from 'commander'
import { runSync } from './commands/sync.js'
import { renderHumanReport, type Verbosity } from './format/human-report.js'
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
      dryRun: boolean
      yes: boolean
      json: boolean
      quiet: boolean
      verbose: boolean
    }) => {
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
        const verbosity: Verbosity = options.quiet
          ? 'quiet'
          : options.verbose
            ? 'verbose'
            : 'default'
        const text = renderHumanReport(report, verbosity)
        if (text) {
          console.log(text)
        }
      }

      process.exitCode = report.exitCode
    },
  )

program.parse(process.argv)
