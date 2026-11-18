import type { MatchableDiagram, MatchFinding } from './match.ts'

/**
 * How much a finding of the deterministic match weighs, for a check that fails a build:
 * - `error`: the diagram says something the code contradicts (an element nothing in the code
 *   matches, a drawn dependency the code does not have);
 * - `warning`: the diagram is behind the code (a link to code that is gone, a dependency the
 *   code has and the diagram does not draw).
 * An undocumented process is reported, never weighed: most code has some.
 */
export type ConformanceLevel = 'error' | 'warning'

export const CONFORMANCE_LEVELS = [
  'error',
  'warning',
] as const satisfies readonly ConformanceLevel[]

export const MATCH_FINDING_LEVELS: Record<MatchFinding['kind'], ConformanceLevel> = {
  'missing-in-code': 'error',
  'relation-not-in-code': 'error',
  'stale-link': 'warning',
  'dependency-not-drawn': 'warning',
}

/** Whether a finding of `level` reaches the `failOn` threshold (`warning` counts errors too). */
export function reachesLevel(level: ConformanceLevel, failOn: ConformanceLevel): boolean {
  return failOn === 'warning' || level === 'error'
}

/** The name each element of the diagram shows, by id, for messages. */
export function diagramElementNames(diagram: MatchableDiagram): Map<string, string> {
  const names = new Map<string, string>()
  const add = (items: readonly { id: string; label?: string }[]) => {
    for (const item of items) names.set(item.id, item.label?.trim() || item.id)
  }
  switch (diagram.kind) {
    case 'package':
    case 'component':
    case 'c4':
    case 'activity':
      add(diagram.elements)
      break
    case 'class':
      add(diagram.classes)
      break
    case 'sequence':
      add(diagram.participants)
      break
    default:
      break
  }
  return names
}

/** One sentence about a finding, in English, the elements named as the diagram shows them. */
export function describeMatchFinding(
  finding: MatchFinding,
  nameOf: (id: string) => string = (id) => id,
): string {
  switch (finding.kind) {
    case 'missing-in-code':
      return `${nameOf(finding.elementId)} is not in the code`
    case 'stale-link':
      return `${nameOf(finding.elementId)} is linked to ${finding.codeKey}, which is no longer in the code`
    case 'relation-not-in-code':
      return `${nameOf(finding.from)} → ${nameOf(finding.to)} is drawn, but the code has no such dependency`
    case 'dependency-not-drawn':
      return (
        `${nameOf(finding.from)} depends on ${nameOf(finding.to)} in the code ` +
        `(${finding.count} ${finding.count === 1 ? 'link' : 'links'}), but the diagram doesn't show it`
      )
  }
}
