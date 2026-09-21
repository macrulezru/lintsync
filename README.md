# lintsync

Keep ESLint, Prettier, and Stylelint configs in sync with a shared preset, across one project or many — without losing local overrides.

lintsync writes preset rules directly into your existing config files (no `extends` package to install), tracks which keys it owns in a small `.lintsync/manifest.json`, and asks you (or fails safely in CI) whenever a rule you changed by hand conflicts with a rule the preset wants to change.

- **Node.js 20+**, pure ESM, no dependencies added to your `package.json` beyond what you ask it to install.
- Point edits, not full-file rewrites — your comments, quote style, and formatting outside the touched keys are preserved.
- Supports JSON/JSONC, YAML, and JS/TS (CommonJS `module.exports` or ESM `export default`, including modern ESLint flat config arrays) config files.

## Install

```sh
npm install -g lintsync
```

Or run it without installing:

```sh
npx lintsync init --preset=npm-lib
```

## Quick start

```sh
# In a project that already has a package.json:
lintsync init --preset=npm-lib

# ... edit some rules by hand, or let a new lintsync release change the preset ...

lintsync status        # see what has drifted from the preset
lintsync sync --yes    # apply the safe changes; conflicts stop and ask (interactively) or fail (in CI)
```

## How it works

- A **preset** (`vue-app` or `npm-lib` today) is a built-in bundle of rules per tool, plus the list of dependencies to install and the keys it considers its own (`managedKeys`).
- `lintsync init` installs those dependencies, writes each tool's config file from the preset, and records a **manifest** entry per tool at `.lintsync/manifest.json` — commit this file.
- The manifest is not a source of truth; it's a record of "what the preset last applied." Every `sync`/`status` run re-reads your actual config file and compares it against both the manifest and the current preset:
  - File matches the manifest (you haven't touched the key) → quietly update it to the preset's current value.
  - File already matches the preset → nothing to do.
  - File differs from both → **conflict**. Nothing is written until you resolve it.
- `lintsync set`/`get`/`unset` edit a config field directly and deliberately leave the manifest untouched — a manual edit is exactly the kind of thing that should show up as a conflict on the next `sync`, not be silently overwritten.

## Commands

Every command accepts `--cwd <path>` (default: current directory) unless noted otherwise, and most accept `--json` for machine-readable output.

### `lintsync init [tool] --preset=<name>`

Installs dependencies, generates config file(s) from a preset, records them in the manifest, and wires up `lint`/`lint:fix`/`format` npm scripts.

```sh
lintsync init --preset=vue-app          # eslint + prettier + stylelint, one shot
lintsync init eslint --preset=npm-lib   # just eslint, e.g. because prettier is already set up
lintsync init --preset=vue-app --force  # overwrite an existing config instead of skipping it
```

- Without `[tool]`, every tool the preset defines is initialized in one run.
- If a tool's config file already exists (under any of its conventional names — e.g. `eslint.config.js`/`.mjs`/`.cjs`/`.ts`), that tool is **skipped** with a warning rather than aborting the whole command. Pass `--force` to overwrite it instead.
- Dependencies are installed via whatever package manager the project already uses (detected from lockfiles), as ordinary `devDependencies` — lintsync never edits `package.json`'s dependency lists by hand.

Flags: `--preset <name>` (required), `--force`, `--cwd`, `--json`, `--quiet`, `--verbose`.

### `lintsync sync [--tool <name>] [--dry-run] [--yes]`

Compares the current project against its preset and applies the safe changes.

```sh
lintsync sync                # preview: shows what would change, writes nothing without --yes
lintsync sync --yes          # apply non-conflicting changes
lintsync sync --dry-run      # explicit preview, never writes even with --yes
lintsync sync --tool eslint  # restrict to one tool
```

- When run in a real terminal without `--dry-run`/`--yes`/`--json`, a conflict opens an interactive TUI: page through conflicts with the arrow keys, pick **accept preset** / **keep local** / **edit manually** for each, with a live preview of the resulting value. Resolving there applies immediately.
- In CI (no TTY) or with `--json`, a conflict is reported and left completely untouched — exit code `1`.
- A conflict on one key withholds _all_ pending changes for that tool's file until it's resolved — nothing is written half-way.
- "Keep local" / a manual value is a per-run decision, not a permanent pin: the manifest has no field for "intentionally diverges forever," so the same conflict can resurface on a later `sync` if the file or the preset changes again.

Flags: `--tool <name>`, `--dry-run`, `-y, --yes`, `--all`, `--tag <tag>`, `--registry <path>`, `--cwd`, `--json`, `--quiet`, `--verbose`.

#### Batch mode: `--all`

Run `sync` across every project in your registry (see [`projects`](#lintsync-projects-addremovelist) below) instead of one `--cwd`:

```sh
lintsync sync --all                    # every registered project
lintsync sync --all --tag type:site    # only projects tagged type:site
lintsync sync --all --yes
```

Batch runs are always non-interactive — a conflict is reported per project, never opens the TUI. The overall exit code is `0` if every project succeeded, that same code if every project failed the same way, or `3` if projects disagree (so CI can tell "uniform outcome" from "go look at the JSON").

### `lintsync status [--all]`

Shows drift from the preset without ever writing anything — the read-only sibling of `sync --dry-run`.

```sh
lintsync status
lintsync status --all --tag type:npm-package
```

Unlike `sync`, a conflict here is just a _state_ of the project, not a failure of the command: `status` exits `0` as long as it could actually read the config and find the preset, even if there's a conflict to look at. Only a genuine execution error (bad manifest, unknown preset, unreadable file) is non-zero.

### `lintsync get <path>`

Reads one value straight from a tracked config file.

```sh
lintsync get prettier.printWidth
lintsync get 'eslint.rules["@typescript-eslint/no-unused-vars"]'
```

### `lintsync set <path> <value>`

Writes one value directly, without touching the manifest.

```sh
lintsync set eslint.rules.no-unused-vars off
lintsync set prettier.printWidth 100
lintsync set eslint.rules.no-unused-vars '["warn", {"argsIgnorePattern": "^_"}]'
```

The value is parsed as JSON when it's valid JSON (`100` → the number 100, `true` → the boolean, `["warn", {...}]` → a real array), and used as a plain string otherwise (`off` → `"off"`) — no manual quoting needed for the common case.

### `lintsync unset <path>`

Removes a field entirely.

```sh
lintsync unset stylelint.rules.color-no-invalid-hex
```

#### Path syntax (`get`/`set`/`unset`)

A path is the tool name, then bracket-notation field segments (lodash/JS-property-access style): `eslint.rules.no-console`. Use brackets with quotes for a segment containing a dot, a bracket, or that you'd rather quote explicitly:

```sh
eslint.rules["vue/multi-word-component-names"]
eslint.rules["@typescript-eslint/no-unused-vars"]
```

The tool is resolved to its actual config file via `.lintsync/manifest.json` — run `lintsync init` (or register the tool some other way in the manifest) before using these commands.

### `lintsync migrate <tool> --to <format>`

Converts a legacy config to a new format or location. Never deletes the source file or overwrites an existing target.

```sh
lintsync migrate eslint --to flat      # .eslintrc.* -> eslint.config.mjs
lintsync migrate prettier --to yaml    # .prettierrc.json -> .prettierrc.yaml
lintsync migrate stylelint --to json
```

- **eslint → flat**: only `rules` is migrated (it's byte-for-byte the same shape in both formats). Anything else found in the legacy file — `extends`, `plugins`, `env`, `parserOptions`, `globals`, `overrides` — is listed as needing manual review instead of being guessed at, since each has real semantic differences in flat config.
- **prettier/stylelint**: format-for-format (`json`/`yaml`/`js`) — these configs are plain data, so every key carries over unchanged.

Legacy sources are found by conventional filename (`.eslintrc.json`, `.eslintrc.yaml`, `.eslintrc.js`, `prettier.config.js`, etc.); a bare `.eslintrc`/`.prettierrc` with no extension is not auto-detected today.

### `lintsync projects add/remove/list`

Manages a global registry of known projects at `~/.lintsync/projects.json`, for batch operations.

```sh
lintsync projects add vuecraft ~/dev/vuecraft --tags type:site
lintsync projects add use-viewport ~/dev/npm/use-viewport --tags type:npm-package
lintsync projects list
lintsync projects list --tag type:site
lintsync projects remove vuecraft
```

Pass `--registry <path>` to any of these (or to `sync --all` / `status --all`) to use a registry file somewhere other than the default.

## Exit codes

The same table applies to `sync`, `status`, `init`, `get`, `set`, `unset`, and `migrate`:

| Code | Meaning                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------- |
| `0`  | Success — no changes needed, changes applied, or (for `status`) just observed                                 |
| `1`  | Unresolved conflict (`sync` only)                                                                             |
| `2`  | Execution error — file/preset not found, unsupported format, parse failure, an edit that can't be made safely |
| `3`  | Batch mode only: projects disagreed on their exit code                                                        |

## Presets

Two built-in presets ship today; presets live inside lintsync itself, never as separate npm packages, so `npm update lintsync` is how you get preset updates.

- **`vue-app`** — ESLint (flat config + `eslint-plugin-vue` + `typescript-eslint`) + Prettier + Stylelint, for Vue/Nuxt applications.
- **`npm-lib`** — ESLint (flat config + `typescript-eslint`) + Prettier, for library-style npm packages with no CSS.

Both use: no semicolons, single quotes, `trailingComma: 'all'`, `printWidth: 100`, `tabWidth: 2`.

## Supported config formats

| Format       | Files                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSON / JSONC | `.json`, `.jsonc`                                                                                                                                                                                                   |
| YAML         | `.yaml`, `.yml`                                                                                                                                                                                                     |
| JS/TS        | `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts` — `export default {...}` / `module.exports = {...}`, or an array whose last element is the config object (the shape a real flat config with spread base configs takes) |

For JS/TS files, only literal values (strings, numbers, booleans, `null`, and arrays/objects built from them) are read or written. A dynamic expression (a spread, a function call, an imported variable) is left alone — lintsync will tell you it can't safely touch it rather than guessing.

## Development

```sh
npm install
npm run build      # tsc -> dist/
npm test           # vitest
npm run lint       # eslint .
npm run format     # prettier --check .
npm run typecheck  # tsc --noEmit
```

## License

MIT
