import { describe, expect, it } from 'vitest'
import {
  createEmptyToolManifest,
  parseManifest,
  serializeManifest,
  type Manifest,
} from './manifest.js'

describe('manifest', () => {
  it('round-trips through serialize/parse', () => {
    const manifest: Manifest = {
      eslint: {
        preset: 'vue-app',
        version: '1.4.0',
        configPath: 'eslint.config.js',
        managed: {
          'rules.no-console': { presetValue: 'warn', version: '1.4.0' },
          'rules.vue/multi-word-component-names': { presetValue: 'off', version: '1.4.0' },
        },
      },
    }
    expect(parseManifest(serializeManifest(manifest))).toEqual(manifest)
  })

  it('serializes with a trailing newline for clean commits', () => {
    const manifest: Manifest = {}
    expect(serializeManifest(manifest).endsWith('\n')).toBe(true)
  })

  it('creates an empty tool manifest ready to accumulate managed keys', () => {
    expect(createEmptyToolManifest('npm-lib', '0.1.0', '.prettierrc.json')).toEqual({
      preset: 'npm-lib',
      version: '0.1.0',
      configPath: '.prettierrc.json',
      managed: {},
    })
  })
})
