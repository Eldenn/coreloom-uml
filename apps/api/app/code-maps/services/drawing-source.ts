import { flowSlice, structureSlice } from '@coreloom-uml/codemap'
import {
  type DrawingResult,
  type LanguageModel,
  proposeProcessDiagram,
  proposeStructureDiagram,
  type SourceExcerpt,
  type SuggestedDiagramKind,
} from '@coreloom-uml/llm'
import Architecture from '#app/architectures/models/architecture'
import type { readDetectedCodeMap } from '#app/code-maps/services/code-map-storage'
import type User from '#app/users/models/user'

/** A diagram to draw from a code map: its kind, what it is about, and the code it covers. */
export type DrawingTarget = {
  kind: SuggestedDiagramKind
  title: string
  reason: string
  /** Folder or class keys for a structure, the one start for a sequence or an activity diagram. */
  focus: readonly string[]
}

/** What a drawing covers and how to draw it, with the source of its files when it was read. */
export type DrawingSource = {
  nodes: number
  /** The nodes whose files are worth reading: none for a package or a component diagram. */
  sourceNodes: readonly { kind: string; path?: string; line?: number }[]
  draw: (model: LanguageModel, sources?: readonly SourceExcerpt[]) => Promise<DrawingResult>
}

/**
 * What the model reads to draw `target` as a new view of `architecture` (diagrams preloaded), or
 * null when the code it covers is not in the map.
 */
export function drawingSource(
  map: Awaited<ReturnType<typeof readDetectedCodeMap>>,
  target: DrawingTarget,
  architecture: Architecture,
  locale: 'en' | 'fr',
): DrawingSource | null {
  const common = {
    architecture: architecture.title,
    titles: architecture.diagrams.map((diagram) => diagram.title),
    request: { title: target.title, reason: target.reason },
    locale,
  }
  const { kind } = target
  if (kind === 'sequence' || kind === 'activity') {
    const [start] = target.focus
    const slice = start === undefined ? null : flowSlice(map, start)
    if (!slice) return null
    return {
      nodes: slice.nodes.length,
      sourceNodes: slice.nodes,
      draw: (model, sources) =>
        proposeProcessDiagram(model, {
          ...common,
          sources,
          entry: slice.entry,
          entryKind: slice.entryKind,
          kind,
          nodes: slice.nodes,
          calls: slice.calls,
        }),
    }
  }
  const slice = structureSlice(map, target.focus, kind)
  if (slice.nodes.length === 0) return null
  return {
    nodes: slice.nodes.length,
    // Folders and their imports say all a package or component diagram shows.
    sourceNodes: kind === 'class' ? slice.nodes.filter((node) => !node.context) : [],
    draw: (model, sources) =>
      proposeStructureDiagram(model, {
        ...common,
        kind,
        nodes: slice.nodes,
        edges: slice.edges,
        sources,
      }),
  }
}

/** Every view of a project's architectures, so that the model proposes none of them again. */
export async function projectViews(projectId: number, user: User) {
  const architectures = await Architecture.query()
    .where('projectId', projectId)
    .where('userId', user.id)
    .preload('diagrams')
  return architectures.flatMap((architecture) =>
    architecture.diagrams.map((diagram) => ({ title: diagram.title, kind: diagram.kind })),
  )
}
