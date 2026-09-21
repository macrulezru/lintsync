import type { ProjectEntry } from '../registry/types.js'

export function renderProjectsList(projects: ProjectEntry[]): string {
  if (projects.length === 0) {
    return 'Нет зарегистрированных проектов.'
  }
  return projects
    .map((project) => {
      const tags = project.tags.length > 0 ? `  [${project.tags.join(', ')}]` : ''
      return `${project.name}  ${project.path}${tags}`
    })
    .join('\n')
}
