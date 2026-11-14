import {
  type CodeMap,
  type CodeSliceNode,
  codeSlice,
  type DiagramMatch,
  type MatchFinding,
} from '@coreloom-uml/codemap'
import type { ConformanceSource } from '@coreloom-uml/llm'
import { toPlantUml, type UmlSpec } from '@coreloom-uml/uml'
import type { CodeReviewEvidence } from '#app/code-reviews/constants/code-review'

/** Element ids to their names, from whatever lists the diagram kind has. */
export function elementNames(spec: UmlSpec): Map<string, string> {
  const names = new Map<string, string>()
  for (const value of Object.values(spec)) {
    if (!Array.isArray(value)) continue
    for (const item of value as unknown[]) {
      if (typeof item !== 'object' || item === null || !('id' in item)) continue
      const { id } = item
      if (typeof id !== 'string') continue
      const label = 'label' in item ? item.label : undefined
      names.set(id, typeof label === 'string' && label ? label : id)
    }
  }
  return names
}

/** One English sentence per deterministic finding, and per drawn relation found in the code. */
export function matchChecks(match: DiagramMatch, nameOf: (id: string) => string): string[] {
  const name = (id: string) => `${nameOf(id)} (${id})`
  const finding = (item: MatchFinding): string => {
    switch (item.kind) {
      case 'missing-in-code':
        return `${name(item.elementId)} was not found in the code.`
      case 'stale-link':
        return `${name(item.elementId)} is linked to ${item.codeKey}, which no longer exists.`
      case 'relation-not-in-code':
        return `The relation ${name(item.from)} -> ${name(item.to)}${item.label ? ` "${item.label}"` : ''} has no counterpart in the code.`
      case 'dependency-not-drawn':
        return `The code of ${name(item.from)} depends on ${name(item.to)} (${String(item.count)} edges) but no relation is drawn.`
    }
  }
  const found = match.relations
    .filter((relation) => relation.status === 'found')
    .map(
      (relation) =>
        `The relation ${name(relation.from)} -> ${name(relation.to)} is in the code (${relation.evidence
          .map((edge) => `${edge.from} -> ${edge.to}`)
          .join(', ')}).`,
    )
  return [...match.findings.map(finding), ...found]
}

/**
 * What `reviewConformance` reads about one diagram: its PlantUML text without layout, its
 * elements with the code they stand for, the deterministic checks, and the slice of the map
 * around the linked places. `evidence` turns a cited key into the place the finding stores.
 */
export function conformanceSource(
  diagram: { id: number; kind: string; title: string; content: UmlSpec },
  map: CodeMap,
  match: DiagramMatch,
  options: { locale: 'en' | 'fr'; snippets?: readonly { key: string; text: string }[] },
): {
  source: ConformanceSource
  evidence: (key: string) => CodeReviewEvidence
} {
  const names = elementNames(diagram.content)
  const nameOf = (id: string) => names.get(id) ?? id
  const slice = codeSlice(map, match)
  const byKey = new Map<string, CodeSliceNode>(slice.nodes.map((node) => [node.key, node]))
  return {
    source: {
      diagram: {
        id: diagram.id,
        kind: diagram.kind,
        title: diagram.title,
        text: toPlantUml(diagram.content, { layout: false }),
      },
      elements: match.elements.map((element) => ({
        id: element.elementId,
        name: nameOf(element.elementId),
        status: element.status,
        codeKeys: element.candidates.map((candidate) => candidate.codeKey),
      })),
      checks: matchChecks(match, nameOf),
      nodes: slice.nodes,
      edges: slice.edges,
      ...(options.snippets?.length ? { snippets: options.snippets } : {}),
      locale: options.locale,
    },
    evidence: (key) => {
      const node = byKey.get(key)
      return {
        key,
        ...(node?.path !== undefined ? { path: node.path } : {}),
        ...(node?.line !== undefined ? { line: node.line } : {}),
      }
    },
  }
}
