import { describe, expect, it } from 'vitest'
import { jsonAdapter } from '../../merge-engine/json-adapter.js'
import { parseManifest, serializeManifest, type Manifest } from '../../merge-engine/manifest.js'
import { assembleProjectReport, type ToolSyncAttempt } from '../../merge-engine/report.js'
import { syncTool, type PresetSnapshot } from '../../merge-engine/sync.js'

/**
 * End-to-end test of the whole stage-3 pipeline (manifest -> syncTool -> report) against a
 * small "fixture project" in memory: an eslint config the user hand-edited (conflict) and a
 * prettier config that's already in sync (clean). Verifies the assembled report matches the
 * shape documented in spec 7.5.3, including that it survives a real JSON.stringify round trip
 * (so ConfigPath arrays come out as plain string arrays, not tuples/objects).
 */
describe('single-project sync pipeline (JSON-only, spec 7.5.3 shape)', () => {
  const manifestText = serializeManifest({
    eslint: {
      preset: 'vue-app',
      version: '1.3.0',
      configPath: 'eslint.config.json',
      managed: {
        'rules.no-console': { presetValue: 'off', version: '1.3.0' },
      },
    },
    prettier: {
      preset: 'vue-app',
      version: '1.4.0',
      configPath: '.prettierrc.json',
      managed: {
        semi: { presetValue: false, version: '1.4.0' },
      },
    },
  } satisfies Manifest)

  const eslintFileText = `{
  "rules": {
    "no-console": "error"
  }
}
`
  const prettierFileText = `{
  "semi": false
}
`

  const eslintPreset: PresetSnapshot = {
    name: 'vue-app',
    version: '1.4.0',
    values: { rules: { 'no-console': 'warn' } },
    managedKeys: [['rules', '*']],
  }
  const prettierPreset: PresetSnapshot = {
    name: 'vue-app',
    version: '1.4.0',
    values: { semi: false },
    managedKeys: [['*']],
  }

  it('produces a conflict for eslint (user overrode it) and clean for prettier', () => {
    const manifest = parseManifest(manifestText)

    const eslintResult = syncTool({
      adapter: jsonAdapter,
      fileText: eslintFileText,
      preset: eslintPreset,
      manifestManaged: manifest.eslint?.managed ?? {},
      dryRun: true,
    })
    const prettierResult = syncTool({
      adapter: jsonAdapter,
      fileText: prettierFileText,
      preset: prettierPreset,
      manifestManaged: manifest.prettier?.managed ?? {},
      dryRun: true,
    })

    const attempts: ToolSyncAttempt[] = [
      {
        tool: 'eslint',
        configPath: 'eslint.config.json',
        preset: eslintPreset,
        result: eslintResult,
      },
      {
        tool: 'prettier',
        configPath: '.prettierrc.json',
        preset: prettierPreset,
        result: prettierResult,
      },
    ]

    const report = assembleProjectReport(attempts)

    // Round-trip through JSON to prove the shape is what a `--json` CLI consumer would receive.
    const wireReport = JSON.parse(JSON.stringify(report)) as typeof report

    expect(wireReport).toEqual({
      project: null,
      tools: [
        {
          tool: 'eslint',
          configPath: 'eslint.config.json',
          preset: { name: 'vue-app', version: '1.4.0' },
          status: 'conflict',
          changes: [],
          conflicts: [
            {
              path: ['rules', 'no-console'],
              fileValue: 'error',
              manifestValue: 'off',
              presetValue: 'warn',
            },
          ],
          error: null,
        },
        {
          tool: 'prettier',
          configPath: '.prettierrc.json',
          preset: { name: 'vue-app', version: '1.4.0' },
          status: 'clean',
          changes: [],
          conflicts: [],
          error: null,
        },
      ],
      exitCode: 1,
    })
  })
})
