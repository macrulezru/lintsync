import { describe, expect, it } from 'vitest'
import type { ConfigPath } from '../../merge-engine/path.js'
import { NOT_FOUND, type ConfigAdapter, type JsonValue } from '../../merge-engine/types.js'

/**
 * Real input/expected-output text fixtures for one adapter (spec section 12.3). Fixtures are
 * whole files, not mock objects, so the suite catches lost formatting/comments — something an
 * abstract data-structure test cannot see.
 */
export interface AdapterFixtures {
  readExisting: { text: string; path: ConfigPath; expectedValue: unknown }
  readMissing: { text: string; path: ConfigPath }
  setValue: { text: string; path: ConfigPath; value: JsonValue; expectedText: string }
  deleteValue: { text: string; path: ConfigPath; expectedText: string }
  listPaths: { text: string; prefix: ConfigPath; expectedPaths: ConfigPath[] }
}

/**
 * Runs one shared behavioral suite against any ConfigAdapter implementation (spec 7.4.2/12.3).
 * Every format-specific adapter must pass this same suite, parameterized only by its fixtures.
 */
export function runConformanceSuite(
  adapterName: string,
  adapter: ConfigAdapter,
  fixtures: AdapterFixtures,
): void {
  describe(adapterName, () => {
    it('reads an existing value by path', () => {
      const handle = adapter.parse(fixtures.readExisting.text)
      expect(adapter.getValueAt(handle, fixtures.readExisting.path)).toEqual(
        fixtures.readExisting.expectedValue,
      )
    })

    it('returns NOT_FOUND for a path that does not exist', () => {
      const handle = adapter.parse(fixtures.readMissing.text)
      expect(adapter.getValueAt(handle, fixtures.readMissing.path)).toBe(NOT_FOUND)
    })

    it('sets a value, preserving the rest of the file formatting', () => {
      const handle = adapter.parse(fixtures.setValue.text)
      const result = adapter.applyEdits(handle, [
        { op: 'set', path: fixtures.setValue.path, value: fixtures.setValue.value },
      ])
      expect(result).toBe(fixtures.setValue.expectedText)
    })

    it('deletes a value by path', () => {
      const handle = adapter.parse(fixtures.deleteValue.text)
      const result = adapter.applyEdits(handle, [{ op: 'delete', path: fixtures.deleteValue.path }])
      expect(result).toBe(fixtures.deleteValue.expectedText)
    })

    it('finds all paths present under a wildcard prefix', () => {
      const handle = adapter.parse(fixtures.listPaths.text)
      const result = adapter.listPaths(handle, fixtures.listPaths.prefix)
      expect(result).toEqual(fixtures.listPaths.expectedPaths)
    })
  })
}
