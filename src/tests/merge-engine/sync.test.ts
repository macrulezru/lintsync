import { describe, expect, it } from 'vitest'
import { jsonAdapter } from '../../merge-engine/json-adapter.js'
import type { ManifestEntry } from '../../merge-engine/manifest.js'
import { syncTool, type PresetSnapshot } from '../../merge-engine/sync.js'

const vueAppEslintPreset: PresetSnapshot = {
  name: 'vue-app',
  version: '1.4.0',
  values: {
    rules: {
      'no-console': 'warn',
      'no-debugger': 'error',
    },
  },
  managedKeys: [['rules', '*']],
}

describe('syncTool', () => {
  it('reports clean when the file already matches the preset and manifest agrees', () => {
    const fileText = `{
  "rules": {
    "no-console": "warn",
    "no-debugger": "error"
  }
}
`
    const manifestManaged: Record<string, ManifestEntry> = {
      'rules.no-console': { presetValue: 'warn', version: '1.4.0' },
      'rules.no-debugger': { presetValue: 'error', version: '1.4.0' },
    }

    const result = syncTool({
      adapter: jsonAdapter,
      fileText,
      preset: vueAppEslintPreset,
      manifestManaged,
      dryRun: false,
    })

    expect(result.status).toBe('clean')
    expect(result.changes).toEqual([])
    expect(result.conflicts).toEqual([])
  })

  it('proposes a change (would-update) in dry-run when the user has not touched the key', () => {
    // manifest says lintsync last set 'off'; user never touched it since; preset moved to 'warn'.
    const fileText = `{
  "rules": {
    "no-console": "off",
    "no-debugger": "error"
  }
}
`
    const manifestManaged: Record<string, ManifestEntry> = {
      'rules.no-console': { presetValue: 'off', version: '1.3.0' },
      'rules.no-debugger': { presetValue: 'error', version: '1.3.0' },
    }

    const result = syncTool({
      adapter: jsonAdapter,
      fileText,
      preset: vueAppEslintPreset,
      manifestManaged,
      dryRun: true,
    })

    expect(result.status).toBe('would-update')
    expect(result.changes).toEqual([{ path: ['rules', 'no-console'], from: 'off', to: 'warn' }])
    expect(result.newText).toBeUndefined()
  })

  it('applies the change and returns new text (preserving formatting) when not a dry run', () => {
    const fileText = `{
  // team eslint config
  "rules": {
    "no-console": "off",
    "no-debugger": "error"
  }
}
`
    const manifestManaged: Record<string, ManifestEntry> = {
      'rules.no-console': { presetValue: 'off', version: '1.3.0' },
      'rules.no-debugger': { presetValue: 'error', version: '1.3.0' },
    }

    const result = syncTool({
      adapter: jsonAdapter,
      fileText,
      preset: vueAppEslintPreset,
      manifestManaged,
      dryRun: false,
    })

    expect(result.status).toBe('updated')
    expect(result.newText).toBe(`{
  // team eslint config
  "rules": {
    "no-console": "warn",
    "no-debugger": "error"
  }
}
`)
    expect(result.updatedManaged['rules.no-console']).toEqual({
      presetValue: 'warn',
      version: '1.4.0',
    })
  })

  it('reports a conflict when the user overrode a managed key manually', () => {
    // manifest says lintsync last set 'off'; user changed it to 'error' by hand; preset now says 'warn'.
    const fileText = `{
  "rules": {
    "no-console": "error",
    "no-debugger": "error"
  }
}
`
    const manifestManaged: Record<string, ManifestEntry> = {
      'rules.no-console': { presetValue: 'off', version: '1.3.0' },
      'rules.no-debugger': { presetValue: 'error', version: '1.3.0' },
    }

    const result = syncTool({
      adapter: jsonAdapter,
      fileText,
      preset: vueAppEslintPreset,
      manifestManaged,
      dryRun: false,
    })

    expect(result.status).toBe('conflict')
    expect(result.conflicts).toEqual([
      {
        path: ['rules', 'no-console'],
        fileValue: 'error',
        manifestValue: 'off',
        presetValue: 'warn',
      },
    ])
    // nothing written, not even the non-conflicting key
    expect(result.newText).toBeUndefined()
    expect(result.changes).toEqual([])
  })

  it('adds a rule newly introduced by the preset that is not yet in the file', () => {
    const fileText = `{
  "rules": {
    "no-console": "warn"
  }
}
`
    // 'no-debugger' has never been in the file nor the manifest before.
    const manifestManaged: Record<string, ManifestEntry> = {
      'rules.no-console': { presetValue: 'warn', version: '1.4.0' },
    }

    const result = syncTool({
      adapter: jsonAdapter,
      fileText,
      preset: vueAppEslintPreset,
      manifestManaged,
      dryRun: false,
    })

    expect(result.status).toBe('updated')
    expect(result.changes).toEqual([
      { path: ['rules', 'no-debugger'], from: undefined, to: 'error' },
    ])
    expect(result.newText).toBe(`{
  "rules": {
    "no-console": "warn",
    "no-debugger": "error"
  }
}
`)
  })

  it('stops tracking a key the preset no longer manages, without touching the file', () => {
    const fileText = `{
  "rules": {
    "no-console": "warn",
    "no-debugger": "error",
    "old-retired-rule": "warn"
  }
}
`
    const manifestManaged: Record<string, ManifestEntry> = {
      'rules.no-console': { presetValue: 'warn', version: '1.3.0' },
      'rules.no-debugger': { presetValue: 'error', version: '1.3.0' },
      'rules.old-retired-rule': { presetValue: 'warn', version: '1.3.0' },
    }

    const result = syncTool({
      adapter: jsonAdapter,
      fileText,
      preset: vueAppEslintPreset, // no longer defines 'old-retired-rule'
      manifestManaged,
      dryRun: false,
    })

    expect(result.status).toBe('clean')
    expect(result.updatedManaged['rules.old-retired-rule']).toBeUndefined()
  })

  it('treats a flat, top-level `*` managedKeys pattern as Prettier-style whole-file ownership', () => {
    const prettierPreset: PresetSnapshot = {
      name: 'vue-app',
      version: '1.4.0',
      values: { semi: false, singleQuote: true },
      managedKeys: [['*']],
    }
    const fileText = `{
  "semi": true,
  "singleQuote": true
}
`
    const result = syncTool({
      adapter: jsonAdapter,
      fileText,
      preset: prettierPreset,
      manifestManaged: { semi: { presetValue: true, version: '1.3.0' } },
      dryRun: true,
    })

    expect(result.status).toBe('would-update')
    expect(result.changes).toEqual([{ path: ['semi'], from: true, to: false }])
  })
})
