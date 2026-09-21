import envPaths from 'env-paths'
import { join } from 'node:path'

/**
 * Cross-platform OS-standard config directory (via `env-paths`, the same approach tools like
 * AVA/XO/np use) instead of a hand-rolled `~/.lintsync` — `suffix: ''` drops env-paths' default
 * `-nodejs` suffix so the directory is just named `lintsync`:
 *   - Windows: `%APPDATA%\lintsync\Config`
 *   - macOS:   `~/Library/Preferences/lintsync`
 *   - Linux:   `$XDG_CONFIG_HOME/lintsync` (usually `~/.config/lintsync`)
 *
 * This is a genuine behavior change from the pre-existing `~/.lintsync/{projects,presets}.json`
 * layout; since lintsync is still pre-release (0.1.0, dogfooding-only), this is a clean switch
 * with no fallback to the old location.
 */
export function defaultConfigDir(): string {
  return envPaths('lintsync', { suffix: '' }).config
}

export function defaultMainConfigPath(): string {
  return join(defaultConfigDir(), 'config.json')
}

export function defaultRegistryPath(): string {
  return join(defaultConfigDir(), 'projects.json')
}

export function defaultPresetsPath(): string {
  return join(defaultConfigDir(), 'presets.json')
}

/**
 * Where to look for the main config file itself — overridable via `LINTSYNC_CONFIG`, which
 * cli.ts's `--config <path>` flag sets before any command runs (see cli.ts's own comment) so
 * every other function in this module never needs the flag threaded through it directly.
 */
export function resolveMainConfigPath(): string {
  return process.env.LINTSYNC_CONFIG || defaultMainConfigPath()
}
