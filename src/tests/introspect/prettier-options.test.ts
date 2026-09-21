import { describe, expect, it } from 'vitest'
import { getPrettierOptions } from '../../introspect/prettier-options.js'

describe('getPrettierOptions', () => {
  it('reports known boolean, choice, and int options with usable metadata', async () => {
    const options = await getPrettierOptions()

    const semi = options.find((o) => o.name === 'semi')
    expect(semi).toMatchObject({ type: 'boolean', default: true })
    expect(semi?.description.length).toBeGreaterThan(0)

    const trailingComma = options.find((o) => o.name === 'trailingComma')
    expect(trailingComma?.type).toBe('choice')
    expect(trailingComma?.choices?.map((c) => c.value)).toEqual(
      expect.arrayContaining(['all', 'none']),
    )

    const printWidth = options.find((o) => o.name === 'printWidth')
    expect(printWidth).toMatchObject({ type: 'int', default: 80 })
  })

  it('excludes only the "which file/parser/plugin, which range" options', async () => {
    const options = await getPrettierOptions()
    const names = new Set(options.map((o) => o.name))

    for (const excluded of [
      'filepath',
      'plugins',
      'parser',
      'cursorOffset',
      'rangeStart',
      'rangeEnd',
    ]) {
      expect(names.has(excluded)).toBe(false)
    }
  })

  it('keeps the niche-but-valid pragma options (Special category, but real config fields)', async () => {
    const options = await getPrettierOptions()
    const names = new Set(options.map((o) => o.name))

    for (const included of ['insertPragma', 'requirePragma', 'checkIgnorePragma']) {
      expect(names.has(included)).toBe(true)
    }
  })

  it('only reports the four scalar option types the constructor knows how to render', async () => {
    const options = await getPrettierOptions()
    const types = new Set(options.map((o) => o.type))
    for (const type of types) {
      expect(['boolean', 'choice', 'int', 'string']).toContain(type)
    }
  })

  it('attaches choices only to choice-type options', async () => {
    const options = await getPrettierOptions()
    for (const option of options) {
      if (option.type === 'choice') {
        expect(option.choices).toBeDefined()
        expect(option.choices!.length).toBeGreaterThan(0)
      } else {
        expect(option.choices).toBeUndefined()
      }
    }
  })
})
