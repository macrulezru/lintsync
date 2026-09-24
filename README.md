# **LintSync CLI**

![LintSync CLI](https://github.com/macrulezru/assets/blob/master/packages-images/lintsync.png?raw=true)

Keep ESLint, Prettier, and Stylelint configs in sync with a shared preset — across one project or many — without losing local overrides.

LintSync writes preset rules directly into your existing config files (no `extends` package to install), tracks which keys it owns in a small `.lintsync/manifest.json`, and asks you (or fails safely in CI) whenever a rule you changed by hand conflicts with a rule the preset wants to change.

## Features

- **`init`** — installs dependencies, generates ESLint/Prettier/Stylelint config file(s) from a preset, and wires up `lint`/`lint:fix`/`format` npm scripts, all in one command. No `--preset` in a real terminal opens an interactive menu instead: a built-in or saved preset, individual tools with generic defaults, or build a new preset from scratch.
- **`sync`** — compares the project against its preset and applies the safe changes. A key that differs from both the manifest and the current preset is a conflict, not a silent overwrite: an interactive TUI opens to resolve it (accept preset / keep local / edit manually, with a live preview), or it's reported and left untouched in CI.
- **`status`** — the read-only sibling of `sync --dry-run`: shows drift from the preset without ever writing anything.
- **`get`/`set`/`unset`** — read or write one config field directly by path (`eslint.rules["@typescript-eslint/no-unused-vars"]`), deliberately without touching the manifest — a manual edit is exactly the kind of thing that should show up as a conflict on the next `sync`.
- **`migrate`** — converts a legacy config (`.eslintrc.json`, `prettier.config.js`, ...) to a new format or location, never deleting the source or overwriting an existing target.
- **`projects add`/`remove`/`list`** — a global registry of known projects, so `sync --all`/`status --all` can run a check across every one of them at once, filtered by tag, with one aggregate exit code for CI.
- **`presets list`/`remove`** — manage presets built and saved via `init`'s interactive constructor, which pulls Prettier's live option list and roughly 80 Stylelint rules straight from the official `-recommended`/`-standard` configs.
- **Point edits, not full-file rewrites** — comments, quote style, and formatting outside the touched keys are preserved.
- **JSON/JSONC, YAML, and JS/TS** config files, including modern ESLint flat config arrays and CommonJS `module.exports`.

Four built-in presets ship today — `vue-app`, `react-app`, `npm-lib`, `base` — and presets live inside LintSync itself, never as a separate npm package, so `npm update -g lintsync` is how you get preset updates.

📖 **Full documentation, every command's options, and more examples:**
[npm.vuecraft.ru/en/packages/lintsync](https://npm.vuecraft.ru/en/packages/lintsync/guide/overview.html)

## Requirements

- Node.js 20+
- Pure ESM, no dependencies added to your `package.json` beyond what you ask it to install

## Installation

```bash
npm install -g lintsync
```

Or run it without installing:

```bash
npx lintsync init --preset=npm-lib
```

## Quick start

```bash
lintsync init --preset=npm-lib   # in a project that already has a package.json

# ... edit some rules by hand, or let a new preset version change one ...

lintsync status        # see what has drifted from the preset
lintsync sync --yes    # apply the safe changes; conflicts stop and ask (interactively) or fail (in CI)
```

Every command has built-in `--help` (`lintsync --help`, `lintsync sync --help`) — and the [full manual](https://npm.vuecraft.ru/en/packages/lintsync/guide/overview.html) covers every command's options and behavior in detail.

## Example output

`lintsync init --preset=npm-lib` — a real run against a fresh project:

```
preset npm-lib@0.1.0
  ✓ eslint (eslint.config.mjs) — created
  ✓ prettier (.prettierrc.json) — created
  4 packages installed: @eslint/js, eslint, prettier, typescript-eslint
  npm scripts updated: lint, lint:fix, format

Total: 2 created. Exit code: 0
```

`lintsync status --verbose` — after hand-editing one rule the preset also wants to control:

```
eslint (eslint.config.mjs) — preset npm-lib@0.1.0
  ✗ 1 conflict:
      rules.no-console (local: "warn", preset: "error")
        manifest: "error"

prettier (.prettierrc.json) — preset npm-lib@0.1.0
  ✓ up to date

Total: 2 tools, 1 conflict. Exit code: 0
```

`lintsync sync` in a real terminal — the same conflict, resolved interactively instead of just reported:

```
Conflict 1/1: rules.no-console
 Local: "warn"
 Manifest (was): "off"
 Preset (would be): "error"

  ▸ Accept preset
    Keep local
    Edit manually

Preview: "error"
```

## Development

```bash
npm install
npm run build      # tsc -> dist/
npm test           # vitest
npm run lint       # eslint .
npm run format     # prettier --check .
npm run typecheck  # tsc --noEmit
```

---

## Documentation & links

- 📖 **Full documentation:** [npm.vuecraft.ru/en/packages/lintsync](https://npm.vuecraft.ru/en/packages/lintsync/guide/overview.html)
- 🌐 **VueCraft:** [vuecraft.ru/en](https://vuecraft.ru/en)
- 👤 **Author:** [macrulez.ru/en](https://macrulez.ru/en)
- 💻 **GitHub:** [macrulezru/lintsync](https://github.com/macrulezru/lintsync)
- 📦 **NPM:** [lintsync](https://www.npmjs.com/package/lintsync)
- 🐛 **Issues:** [github.com/macrulezru/lintsync/issues](https://github.com/macrulezru/lintsync/issues)

---

## License

MIT

---

## 💖 Support the project

Open source takes time and effort. If this library saves you time or brings value, consider supporting further development.

<a href="https://donate.cryptocloud.plus/M6O34NIN" target="_blank">
  <img src="https://img.shields.io/badge/Donate-CryptoCloud-8A2BE2?style=for-the-badge&logo=cryptocurrency&logoColor=white" alt="Donate via CryptoCloud">
</a>

Thank you for being part of this journey. ❤️
