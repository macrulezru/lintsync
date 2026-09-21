import type { JsonValue } from '../merge-engine/types.js'

/**
 * Stylelint has no equivalent of Prettier's `getSupportInfo()` — `stylelint.rules[name]` returns
 * an empty object with no `meta`/schema in v16.x (verified directly against the installed
 * package), so there's no official, machine-readable source for "what base configs exist" or
 * "what values does this rule accept." This is a small, hand-curated list instead, reusing the
 * exact base configs and rules already shipped in `vue-app`/`base` rather than inventing new
 * ones — everything here has already been run through a real `stylelint` invocation.
 */

export interface StylelintBaseConfigOption {
  package: string
  description: string
}

export const STYLELINT_BASE_CONFIGS: StylelintBaseConfigOption[] = [
  { package: 'stylelint-config-standard', description: 'Generic CSS conventions, no framework' },
  {
    package: 'stylelint-config-standard-scss',
    description: 'stylelint-config-standard plus SCSS syntax support',
  },
  {
    package: 'stylelint-config-recommended-vue',
    description: 'Recommended rules for <style> blocks in .vue single-file components',
  },
]

export interface StylelintRuleOption {
  name: string
  description: string
  /** Value this rule takes when the user turns it on. */
  onValue: JsonValue
  /** Value this rule takes when the user turns it off — `null` disables a rule in Stylelint's
   *  own JSON config format, matching how vue-app/base already disable rules. */
  offValue: JsonValue
}

export const STYLELINT_RULES: StylelintRuleOption[] = [
  {
    name: 'selector-class-pattern',
    description: 'Require class names to match kebab-case (off: allow any naming)',
    onValue: '^[a-z][a-z0-9]*(-[a-z0-9]+)*$',
    offValue: null,
  },
  {
    name: 'no-empty-source',
    description: 'Disallow empty stylesheets (off: allow a <style> block with no rules yet)',
    onValue: true,
    offValue: null,
  },
  {
    name: 'scss/at-rule-no-unknown',
    description: 'Allow SCSS at-rules like @use/@mixin (requires a SCSS base config)',
    onValue: true,
    offValue: null,
  },
]
