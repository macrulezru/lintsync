#!/usr/bin/env node
import { Command } from 'commander'
import { getVersion } from './version.js'

const program = new Command()

program
  .name('lintsync')
  .description('Keep ESLint/Prettier/Stylelint configs in sync with a preset')
  .version(getVersion())

program.parse(process.argv)
