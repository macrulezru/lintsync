import { render } from 'ink'
import { ConflictResolver } from './ConflictResolver.js'
import type { ConflictItem, Resolution } from './types.js'

/**
 * Renders the ConflictResolver TUI in the real terminal and resolves once every conflict has
 * an answer (spec 12.2 stage 8: the integration point between the stage-7 spike and `sync`).
 * Kept in its own module, separate from the pure ConflictResolver component, so commands/sync.ts
 * can import this lazily and never pay for loading ink/react on a non-interactive run.
 */
export function resolveConflictsInteractively(conflicts: ConflictItem[]): Promise<Resolution[]> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <ConflictResolver
        conflicts={conflicts}
        onComplete={(resolutions) => {
          resolve(resolutions)
          unmount()
        }}
      />,
    )
  })
}
