import { describe, expect, it } from 'vitest'
import { renderProjectsList } from '../../format/human-projects-report.js'

describe('renderProjectsList', () => {
  it('shows a message when there are no registered projects', () => {
    expect(renderProjectsList([])).toBe('Нет зарегистрированных проектов.')
  })

  it('lists name, path and tags', () => {
    const text = renderProjectsList([
      { name: 'vuecraft', path: '~/dev/vuecraft', tags: ['site'] },
      { name: 'use-viewport', path: '~/dev/npm/use-viewport', tags: [] },
    ])
    expect(text).toBe('vuecraft  ~/dev/vuecraft  [site]\nuse-viewport  ~/dev/npm/use-viewport')
  })
})
