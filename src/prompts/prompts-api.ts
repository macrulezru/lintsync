import * as clack from '@clack/prompts'

/**
 * The slice of @clack/prompts this module actually uses, as an interface — the real module
 * already matches this shape, so `realPrompts` below is just `clack` itself. Tests inject a
 * fake implementation instead of driving a real terminal, the same dependency-injection
 * pattern used for sync's TUI resolver and init's dependency installer. Kept in its own module
 * (rather than inside init-prompts.ts) so both init-prompts.ts and build-custom-preset.ts can
 * depend on it without depending on each other.
 */
export interface InitPromptsApi {
  intro: typeof clack.intro
  outro: typeof clack.outro
  cancel: typeof clack.cancel
  select: typeof clack.select
  multiselect: typeof clack.multiselect
  confirm: typeof clack.confirm
  text: typeof clack.text
  isCancel: typeof clack.isCancel
}

export const realPrompts: InitPromptsApi = clack

export const TOOL_OPTIONS = [
  { value: 'eslint', label: 'ESLint' },
  { value: 'prettier', label: 'Prettier' },
  { value: 'stylelint', label: 'Stylelint' },
] as const
