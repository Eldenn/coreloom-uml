import * as React from 'react'

import { useDrawableCodeMap } from '@/lib/code-maps'

/**
 * Drawing from the code: offered when the architecture's project has a ready map, on at first when
 * `?code=` named one of them. `sent` is what a message adds to its body while it is on.
 */
export function useCodeMode(projectId: number | null, named: number | undefined) {
  const map = useDrawableCodeMap(projectId, named)
  const [chosen, setChosen] = React.useState<boolean | null>(null)
  const on = map.id !== null && (chosen ?? map.isNamed)
  return {
    offered: map.id !== null,
    set: setChosen,
    sent: on && map.id !== null ? { codeMapId: map.id } : undefined,
  }
}
