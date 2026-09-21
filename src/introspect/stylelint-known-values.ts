import type { JsonValue } from '../merge-engine/types.js'

/**
 * Stylelint has no equivalent of Prettier's `getSupportInfo()` — `stylelint.rules[name]` returns
 * an empty object with no `meta`/schema in v17.x (verified directly against the installed
 * package), so there's no official, machine-readable source for "what base configs exist" or
 * "what values does this rule accept" the way Prettier's `getPrettierOptions()` has. This is a
 * hand-curated catalog instead, but built from three real, authoritative sources rather than
 * guessed at:
 *   - The rule *names* and their recommended values come straight from `stylelint-config-
 *     recommended` and `stylelint-config-standard`'s own shipped rule objects (read directly out
 *     of the installed packages) — the actual "most popular/in-demand" rule set, curated by the
 *     Stylelint maintainers themselves, not an arbitrary top-N picked by hand.
 *   - The full set of valid *values* for each choice-type rule was extracted from each rule's own
 *     source (`lib/rules/<name>/index.mjs`'s `validateOptions({ possible: [...] })` call) — a
 *     real, working enumeration, not a guess, even though nothing exposes it at runtime.
 *   - One extra, `scss/at-rule-no-unknown`, comes from neither config (it's a `stylelint-scss`
 *     plugin rule) but is kept because it's what makes `@use`/`@include`/etc. not falsely flag as
 *     unknown at-rules once an SCSS base config is in play — already used by the `vue-app` preset.
 */

export interface StylelintBaseConfigOption {
  package: string
  description: string
}

/** Selectable via checkboxes (not one-at-a-time) — a real project commonly needs more than one,
 *  e.g. `stylelint-config-standard-scss` (or -less) together with `stylelint-config-recommended-vue`
 *  for a Vue+SCSS app, exactly like the `vue-app` preset itself does. */
export const STYLELINT_BASE_CONFIGS: StylelintBaseConfigOption[] = [
  { package: 'stylelint-config-standard', description: 'Generic CSS conventions, no framework' },
  {
    package: 'stylelint-config-standard-scss',
    description: 'stylelint-config-standard plus SCSS syntax support',
  },
  {
    package: 'stylelint-config-standard-less',
    description: 'stylelint-config-standard plus Less syntax support',
  },
  {
    package: 'stylelint-config-recommended-vue',
    description: 'Recommended rules for <style> blocks in .vue single-file components',
  },
]

export type StylelintRuleValueType = 'boolean' | 'choice' | 'number' | 'string'

export interface StylelintRuleChoice {
  value: string
}

export interface StylelintRuleInfo {
  name: string
  description: string
  type: StylelintRuleValueType
  /**
   * A real, working value for this rule: the exact value `stylelint-config-recommended`/
   * `stylelint-config-standard` itself ships for `boolean`/`choice` types, or a representative
   * example for `number`/`string` (regex-pattern) types. Used to seed the prompt — a boolean
   * confirm's default answer, or a text prompt's placeholder — not force-applied; the user's own
   * answer is what actually gets written.
   */
  recommended: JsonValue
  /** `type: 'choice'` only — the full, source-verified set of values this rule actually accepts. */
  choices?: StylelintRuleChoice[]
}

/**
 * "Possible errors" — from `stylelint-config-recommended` — real mistakes/inconsistencies
 * (unknown at-rules, deprecated properties, duplicate selectors, etc.), all boolean (a rule
 * either catches the mistake or it doesn't; there's no alternate "value" to choose).
 */
const CORRECTNESS_RULES: StylelintRuleInfo[] = [
  {
    name: 'annotation-no-unknown',
    description: 'Disallow unknown annotations (e.g. !important, !default typos)',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'at-rule-descriptor-no-unknown',
    description: 'Disallow unknown descriptors within at-rules like @font-face or @property',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'at-rule-descriptor-value-no-unknown',
    description: 'Disallow unknown values for at-rule descriptors',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'at-rule-no-deprecated',
    description: 'Disallow deprecated at-rules',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'at-rule-no-unknown',
    description: "Disallow unknown at-rules (e.g. a typo'd @media)",
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'at-rule-prelude-no-invalid',
    description: 'Disallow invalid at-rule preludes',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'block-no-empty',
    description: 'Disallow empty blocks ({ }) in rules or at-rules',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'comment-no-empty',
    description: 'Disallow empty comments (/**/)',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'custom-property-no-missing-var-function',
    description: 'Disallow custom properties used without the var() function',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'declaration-block-no-duplicate-custom-properties',
    description: 'Disallow duplicate custom properties within a declaration block',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'declaration-block-no-duplicate-properties',
    description: 'Disallow duplicate properties within a declaration block',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'declaration-block-no-shorthand-property-overrides',
    description: 'Disallow shorthand properties overriding related longhand properties set later',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'declaration-property-value-keyword-no-deprecated',
    description: 'Disallow deprecated keyword values for known properties',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'declaration-property-value-no-unknown',
    description: 'Disallow unknown values for known properties',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'font-family-no-duplicate-names',
    description: 'Disallow duplicate font family names in a font-family list',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'font-family-no-missing-generic-family-keyword',
    description: 'Require a generic font family keyword (e.g. sans-serif) as the final fallback',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'function-calc-no-unspaced-operator',
    description: 'Require spaces around operators inside calc()',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'keyframe-block-no-duplicate-selectors',
    description: 'Disallow duplicate selectors within a single keyframe block',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'keyframe-declaration-no-important',
    description: 'Disallow !important within keyframe declarations (browsers ignore it there)',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'media-feature-name-no-unknown',
    description: 'Disallow unknown media feature names',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'media-feature-name-value-no-unknown',
    description: 'Disallow unknown values for known media features',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'media-query-no-invalid',
    description: 'Disallow invalid media queries',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'media-type-no-deprecated',
    description: 'Disallow deprecated media types',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'named-grid-areas-no-invalid',
    description: 'Disallow invalid named grid areas (mismatched column counts, etc.)',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'nesting-selector-no-missing-scoping-root',
    description: 'Disallow nesting selectors (&) with no scoping root to attach to',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'no-descending-specificity',
    description:
      'Disallow a lower-specificity selector coming after a higher-specificity one for the same element',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'no-duplicate-at-import-rules',
    description: 'Disallow duplicate @import rules for the same target',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'no-duplicate-selectors',
    description: 'Disallow duplicate selectors within a stylesheet',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'no-empty-source',
    description: 'Disallow empty stylesheets',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'no-invalid-double-slash-comments',
    description: 'Disallow // comments in standard CSS (only valid in SCSS/Less)',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'no-invalid-position-at-import-rule',
    description: 'Disallow @import rules placed after other rules (must come first)',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'no-invalid-position-declaration',
    description:
      'Disallow declarations in invalid positions (e.g. directly at the stylesheet root)',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'no-irregular-whitespace',
    description: 'Disallow irregular whitespace characters',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'property-no-deprecated',
    description: 'Disallow deprecated properties',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'property-no-unknown',
    description: 'Disallow unknown properties',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'selector-anb-no-unmatchable',
    description: 'Disallow unmatchable An+B selectors (e.g. :nth-child(0))',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'selector-pseudo-class-no-unknown',
    description: 'Disallow unknown pseudo-class selectors',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'selector-pseudo-element-no-unknown',
    description: 'Disallow unknown pseudo-element selectors',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'selector-type-no-unknown',
    description: 'Disallow unknown type selectors (custom elements are allowed)',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'string-no-newline',
    description: 'Disallow unescaped newlines inside string values',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'syntax-string-no-invalid',
    description: 'Disallow invalid CSS Custom Properties/Paint syntax strings',
    type: 'boolean',
    recommended: true,
  },
]

/**
 * Stylistic conventions — from `stylelint-config-standard` — real choices with more than one
 * reasonable answer (notation style, ordering, naming pattern), unlike the correctness rules
 * above. `recommended`/`choices` for every `choice`-type entry were extracted from the rule's own
 * source, not guessed from documentation.
 */
const STYLE_RULES: StylelintRuleInfo[] = [
  {
    name: 'alpha-value-notation',
    description: 'Require number (0.5) or percentage (50%) notation for alpha-channel values',
    type: 'choice',
    recommended: 'percentage',
    choices: [{ value: 'number' }, { value: 'percentage' }],
  },
  {
    name: 'at-rule-empty-line-before',
    description: 'Require or disallow an empty line before at-rules',
    type: 'choice',
    recommended: 'always',
    choices: [{ value: 'always' }, { value: 'never' }],
  },
  {
    name: 'at-rule-no-vendor-prefix',
    description: 'Disallow vendor-prefixed at-rules (e.g. @-webkit-keyframes)',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'block-no-redundant-nested-style-rules',
    description: 'Disallow nested style rules that could be merged into their parent',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'color-function-alias-notation',
    description: 'Require or disallow the alpha-including alias of a color function (rgb vs rgba)',
    type: 'choice',
    recommended: 'without-alpha',
    choices: [{ value: 'with-alpha' }, { value: 'without-alpha' }],
  },
  {
    name: 'color-function-notation',
    description:
      'Require legacy (rgba(0,0,0,.5)) or modern (rgb(0 0 0 / 50%)) color function notation',
    type: 'choice',
    recommended: 'modern',
    choices: [{ value: 'legacy' }, { value: 'modern' }],
  },
  {
    name: 'color-hex-length',
    description: 'Require short (#fff) or long (#ffffff) hex color notation',
    type: 'choice',
    recommended: 'short',
    choices: [{ value: 'short' }, { value: 'long' }],
  },
  {
    name: 'comment-empty-line-before',
    description: 'Require or disallow an empty line before comments',
    type: 'choice',
    recommended: 'always',
    choices: [{ value: 'always' }, { value: 'never' }],
  },
  {
    name: 'comment-whitespace-inside',
    description:
      'Require or disallow whitespace just inside comment markers (/* text */ vs /*text*/)',
    type: 'choice',
    recommended: 'always',
    choices: [{ value: 'always' }, { value: 'never' }],
  },
  {
    name: 'container-name-pattern',
    description: 'Require @container names to match a pattern (regex; default: kebab-case)',
    type: 'string',
    recommended: '^(--)?([a-z][a-z0-9]*)(-[a-z0-9]+)*$',
  },
  {
    name: 'custom-property-empty-line-before',
    description: 'Require or disallow an empty line before custom properties',
    type: 'choice',
    recommended: 'always',
    choices: [{ value: 'always' }, { value: 'never' }],
  },
  {
    name: 'custom-media-pattern',
    description: 'Require @custom-media names to match a pattern (regex; default: kebab-case)',
    type: 'string',
    recommended: '^([a-z][a-z0-9]*)(-[a-z0-9]+)*$',
  },
  {
    name: 'custom-property-pattern',
    description: 'Require custom property names to match a pattern (regex; default: kebab-case)',
    type: 'string',
    recommended: '^([a-z][a-z0-9]*)(-[a-z0-9]+)*$',
  },
  {
    name: 'declaration-block-no-redundant-longhand-properties',
    description: 'Disallow longhand properties that could be combined into one shorthand',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'declaration-block-single-line-max-declarations',
    description: 'Limit the number of declarations allowed on a single line',
    type: 'number',
    recommended: 1,
  },
  {
    name: 'declaration-empty-line-before',
    description: 'Require or disallow an empty line before declarations',
    type: 'choice',
    recommended: 'always',
    choices: [{ value: 'always' }, { value: 'never' }],
  },
  {
    name: 'font-family-name-quotes',
    description:
      'Require quotes around font family names where required, recommended, or unless a generic keyword',
    type: 'choice',
    recommended: 'always-where-recommended',
    choices: [
      { value: 'always-where-required' },
      { value: 'always-where-recommended' },
      { value: 'always-unless-keyword' },
    ],
  },
  {
    name: 'function-name-case',
    description: 'Require lowercase or uppercase function names',
    type: 'choice',
    recommended: 'lower',
    choices: [{ value: 'lower' }, { value: 'upper' }],
  },
  {
    name: 'function-url-quotes',
    description: 'Require or disallow quotes inside url()',
    type: 'choice',
    recommended: 'always',
    choices: [{ value: 'always' }, { value: 'never' }],
  },
  {
    name: 'hue-degree-notation',
    description: 'Require angle (240deg) or bare number (240) hue notation',
    type: 'choice',
    recommended: 'angle',
    choices: [{ value: 'angle' }, { value: 'number' }],
  },
  {
    name: 'import-notation',
    description: 'Require string or url() notation for @import',
    type: 'choice',
    recommended: 'url',
    choices: [{ value: 'string' }, { value: 'url' }],
  },
  {
    name: 'keyframe-selector-notation',
    description:
      'Require keyword or percentage notation for keyframe selectors (from/to vs 0%/100%)',
    type: 'choice',
    recommended: 'percentage-unless-within-keyword-only-block',
    choices: [
      { value: 'keyword' },
      { value: 'percentage' },
      { value: 'percentage-unless-within-keyword-only-block' },
    ],
  },
  {
    name: 'keyframes-name-pattern',
    description: 'Require @keyframes names to match a pattern (regex; default: kebab-case)',
    type: 'string',
    recommended: '^([a-z][a-z0-9]*)(-[a-z0-9]+)*$',
  },
  {
    name: 'layer-name-pattern',
    description: 'Require @layer names to match a pattern (regex; default: kebab-case)',
    type: 'string',
    recommended: '^([a-z][a-z0-9]*)([.-][a-z0-9]+)*$',
  },
  {
    name: 'length-zero-no-unit',
    description: 'Disallow units on zero-length values (0px -> 0)',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'lightness-notation',
    description: 'Require percentage or bare number lightness notation',
    type: 'choice',
    recommended: 'percentage',
    choices: [{ value: 'percentage' }, { value: 'number' }],
  },
  {
    name: 'media-feature-name-no-vendor-prefix',
    description: 'Disallow vendor-prefixed media feature names',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'media-feature-range-notation',
    description: 'Require prefix (min-width:) or range-context (width >=) media feature notation',
    type: 'choice',
    recommended: 'context',
    choices: [{ value: 'prefix' }, { value: 'context' }],
  },
  {
    name: 'number-max-precision',
    description: 'Limit the number of decimal places allowed in numbers',
    type: 'number',
    recommended: 4,
  },
  {
    name: 'property-no-vendor-prefix',
    description: 'Disallow vendor-prefixed properties',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'rule-empty-line-before',
    description: 'Require or disallow an empty line before rules',
    type: 'choice',
    recommended: 'always-multi-line',
    choices: [
      { value: 'always' },
      { value: 'never' },
      { value: 'always-multi-line' },
      { value: 'never-multi-line' },
    ],
  },
  {
    name: 'selector-attribute-quotes',
    description: 'Require or disallow quotes around attribute selector values',
    type: 'choice',
    recommended: 'always',
    choices: [{ value: 'always' }, { value: 'never' }],
  },
  {
    name: 'selector-class-pattern',
    description: 'Require class selectors to match a pattern (regex; default: kebab-case)',
    type: 'string',
    recommended: '^([a-z][a-z0-9]*)(-[a-z0-9]+)*$',
  },
  {
    name: 'selector-id-pattern',
    description: 'Require id selectors to match a pattern (regex; default: kebab-case)',
    type: 'string',
    recommended: '^([a-z][a-z0-9]*)(-[a-z0-9]+)*$',
  },
  {
    name: 'selector-no-vendor-prefix',
    description: 'Disallow vendor-prefixed selectors',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'selector-not-notation',
    description: 'Require simple or complex :not() selector notation',
    type: 'choice',
    recommended: 'complex',
    choices: [{ value: 'simple' }, { value: 'complex' }],
  },
  {
    name: 'selector-pseudo-element-colon-notation',
    description:
      'Require single or double colon notation for pseudo-elements (:before vs ::before)',
    type: 'choice',
    recommended: 'double',
    choices: [{ value: 'single' }, { value: 'double' }],
  },
  {
    name: 'selector-type-case',
    description: 'Require lowercase or uppercase type selectors',
    type: 'choice',
    recommended: 'lower',
    choices: [{ value: 'lower' }, { value: 'upper' }],
  },
  {
    name: 'shorthand-property-no-redundant-values',
    description: 'Disallow redundant values in shorthand properties (margin: 1px 1px -> 1px)',
    type: 'boolean',
    recommended: true,
  },
  {
    name: 'value-keyword-case',
    description: 'Require lowercase or uppercase value keywords',
    type: 'choice',
    recommended: 'lower',
    choices: [{ value: 'lower' }, { value: 'upper' }],
  },
  {
    name: 'value-no-vendor-prefix',
    description: 'Disallow vendor-prefixed values',
    type: 'boolean',
    recommended: true,
  },
]

const SCSS_RULES: StylelintRuleInfo[] = [
  {
    name: 'scss/at-rule-no-unknown',
    description:
      'Disallow unknown at-rules, with SCSS ones (@use, @mixin, @include, ...) allowed — needed once an SCSS base config is in play (requires the stylelint-scss plugin)',
    type: 'boolean',
    recommended: true,
  },
]

export const STYLELINT_RULES: StylelintRuleInfo[] = [
  ...CORRECTNESS_RULES,
  ...STYLE_RULES,
  ...SCSS_RULES,
]
