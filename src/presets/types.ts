import type { JsonValue } from '../merge-engine/types.js'

/**
 * One base config to compose into a generated flat `eslint.config.js` (spec 11.1's
 * `baseExtends`), e.g. `eslint-plugin-vue/flat/recommended`. The spec's own preset snippet
 * shows these as bare strings, but generating a real, runnable import statement needs more than
 * a label — a package can't be resolved into working code without knowing what to import and
 * how to reference it, and that varies per package (a plain default import + property access
 * for `typescript-eslint`, for instance, rather than a literal subpath import). This is the
 * structured equivalent `presets/generate-config.ts` actually codegens from.
 */
export interface EslintBaseExtend {
  /** Module specifier to import, e.g. `'eslint-plugin-vue'`. Omit (with `importName`) for an
   *  entry that needs no import of its own — e.g. a plain `settings`/glue object, or one that
   *  only references a binding another entry already imports (imports are always emitted
   *  together at the top of the file, so order between entries doesn't matter for this). */
  importPath?: string
  /** Local binding name for the default import. */
  importName?: string
  /** JS expression evaluating to a config array to spread in — referencing `importName` if one
   *  was given, or a plain array literal (`'[{ settings: {...} }]'`) if not. */
  expression: string
}

interface PresetToolDefinitionBase {
  /** npm packages `init` installs as devDependencies for this tool (spec 4.1/11). */
  dependencies: string[]
  /** Filename `init` creates relative to the project root, e.g. `'.prettierrc.json'`. */
  configFileName: string
  /** The values this tool's preset owns, at the paths covered by managedKeys (spec 7.1). */
  rules: JsonValue
  /** Bracket-notation managedKeys patterns (spec 7.1); parsed into ConfigPath by toPresetSnapshot. */
  managedKeys: string[]
}

/** A flat `eslint.config.js`-shaped tool (spec 7.4.3/11.1): array export, base configs spread in. */
export interface FlatJsPresetToolDefinition extends PresetToolDefinitionBase {
  configFormat: 'flat'
  baseExtends?: EslintBaseExtend[]
}

/** A plain JSON config file (Prettier/Stylelint, spec 11.1). */
export interface JsonPresetToolDefinition extends PresetToolDefinitionBase {
  configFormat: 'json'
  /**
   * Package names for the JSON file's own `extends` array (e.g. Stylelint's
   * `stylelint-config-standard-scss`) — unlike the flat-JS case, JSON's `extends` is just a
   * list of strings the tool resolves itself, no import wrangling needed.
   */
  extendsPackages?: string[]
}

export type PresetToolDefinition = FlatJsPresetToolDefinition | JsonPresetToolDefinition

export interface Preset {
  name: string
  version: string
  tools: Partial<Record<string, PresetToolDefinition>>
}

/** Presets are built into lintsync itself, never resolved from npm (spec section 6). */
export interface PresetRegistry {
  getPreset(name: string): Preset | undefined
}
