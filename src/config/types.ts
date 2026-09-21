/**
 * lintsync's own settings — not a per-project preset, not the project registry, but the tool's
 * own configuration (where to find/store the other two). User-edited by hand; lintsync only
 * ever reads it, never writes it (unlike presets.json/projects.json, which lintsync itself
 * manages via CLI commands).
 */
export interface MainConfig {
  /** Overrides where locally-saved presets are stored (default: the OS-standard config dir's
   *  `presets.json` — see `config/paths.ts`). */
  presetsPath?: string
  /** Overrides where the global project registry is stored (default: the OS-standard config
   *  dir's `projects.json`). */
  registryPath?: string
}
