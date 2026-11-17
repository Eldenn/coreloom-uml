import {
  type CodeMap as CodeMapValue,
  type ConformanceLevel,
  type DiagramMatch,
  describeMatchFinding,
  diagramElementNames,
  findUncoveredFlows,
  linkedCodeKeys,
  MATCH_FINDING_LEVELS,
  type MatchableDiagram,
} from '@coreloom-uml/codemap'
import Architecture from '#app/architectures/models/architecture'
import { CodeMapStatus } from '#app/code-maps/constants/code-map'
import CodeMap from '#app/code-maps/models/code-map'
import DiagramCodeLink from '#app/code-maps/models/diagram-code-link'
import { matchStoredDiagram } from '#app/code-maps/services/diagram-code-links'
import type {
  CodeConformanceDiagramOutput,
  CodeConformanceOutput,
  CodeMapProcessesOutput,
} from '#app/code-maps/validators/code-maps-output'
import { REVIEWABLE_DIAGRAM_KINDS } from '#app/code-reviews/constants/code-review'
import type Diagram from '#app/diagrams/models/diagram'
import type User from '#app/users/models/user'

/** Flows listed, largest first; the rest are counted in `total`. */
export const MAX_PROCESSES = 50
/** Nodes listed per flow, in the order the calls reach them. */
const MAX_NODES = 25

/** A diagram of the project, with the architecture it sits in. */
export type ProjectDiagram = { diagram: Diagram; architecture: Architecture }

/** A diagram of the project matched against the map: its stored links win over the matcher. */
export type MatchedDiagram = ProjectDiagram & { match: DiagramMatch }

/** The project's newest map that is ready to read, if any. */
export function latestReadyCodeMap(projectId: number): Promise<CodeMap | null> {
  return CodeMap.query()
    .where('projectId', projectId)
    .where('status', CodeMapStatus.Ready)
    .whereNotNull('storageKey')
    .orderBy('createdAt', 'desc')
    .orderBy('id', 'desc')
    .first()
}

/** Every diagram `user` has in the project, architecture by architecture, in their order. */
export async function projectDiagrams(projectId: number, user: User): Promise<ProjectDiagram[]> {
  const architectures = await Architecture.query()
    .where('projectId', projectId)
    .where('userId', user.id)
    .preload('diagrams', (diagrams) => diagrams.orderBy('position').orderBy('id'))
    .orderBy('id', 'asc')
  return architectures.flatMap((architecture) =>
    architecture.diagrams.map((diagram) => ({ diagram, architecture })),
  )
}

/** Matches each diagram against the map, with the links its owner reviewed. */
export async function matchDiagrams(
  diagrams: ProjectDiagram[],
  map: CodeMapValue,
): Promise<MatchedDiagram[]> {
  const links = diagrams.length
    ? await DiagramCodeLink.query().whereIn(
        'diagramId',
        diagrams.map(({ diagram }) => diagram.id),
      )
    : []
  return diagrams.map((item) => ({
    ...item,
    match: matchStoredDiagram(
      item.diagram,
      map,
      links.filter((link) => link.diagramId === item.diagram.id),
    ),
  }))
}

/**
 * The processes no diagram documents: the calls followed from each entry point (route, job,
 * command, handler) that touch no code linked to a diagram element. No model is called.
 */
export function undocumentedProcesses(
  codeMap: CodeMap,
  map: CodeMapValue,
  matches: readonly MatchedDiagram[],
): CodeMapProcessesOutput {
  const flows = findUncoveredFlows(map, linkedCodeKeys(matches.map(({ match }) => match)))
  return {
    codeMapId: codeMap.id,
    total: flows.length,
    processes: flows.slice(0, MAX_PROCESSES).map((flow) => ({
      entry: flow.entry,
      entryKind: flow.entryKind,
      size: flow.nodes.length,
      depth: flow.depth,
      folders: flow.folders,
      nodes: flow.nodes.slice(0, MAX_NODES),
    })),
  }
}

function isCheckable(diagram: Diagram): boolean {
  return (
    diagram.content !== null &&
    (REVIEWABLE_DIAGRAM_KINDS as readonly string[]).includes(diagram.kind)
  )
}

/** The findings of one matched diagram, each weighed and said in one sentence. */
export function diagramConformance({
  diagram,
  architecture,
  match,
}: MatchedDiagram): CodeConformanceDiagramOutput {
  const names = diagramElementNames(diagram.content as MatchableDiagram)
  const nameOf = (id: string) => names.get(id) ?? id
  const findings = match.findings.map((finding) => ({
    ...finding,
    level: MATCH_FINDING_LEVELS[finding.kind],
    message: describeMatchFinding(finding, nameOf),
  }))
  return {
    diagramId: diagram.id,
    title: diagram.title,
    kind: diagram.kind,
    architectureId: architecture.id,
    architectureTitle: architecture.title,
    counts: countLevels(findings),
    findings,
  }
}

function countLevels(findings: readonly { level: ConformanceLevel }[]) {
  return {
    error: findings.filter((finding) => finding.level === 'error').length,
    warning: findings.filter((finding) => finding.level === 'warning').length,
  }
}

/**
 * How the project's diagrams line up with one of its maps, deterministically: the findings of
 * the matcher for each diagram the map can check, weighed `error` or `warning`, and how many
 * processes no diagram documents. What a build fails on is the caller's choice.
 */
export async function codeConformance(
  codeMap: CodeMap,
  map: CodeMapValue,
  user: User,
): Promise<CodeConformanceOutput> {
  const diagrams = await projectDiagrams(codeMap.projectId, user)
  // Every diagram counts for the processes: a state diagram can't be checked, but its links can.
  const matches = await matchDiagrams(diagrams, map)
  const checked = matches.filter(({ diagram }) => isCheckable(diagram)).map(diagramConformance)
  return {
    codeMap: {
      id: codeMap.id,
      repositoryUrl: codeMap.repositoryUrl,
      branch: codeMap.branch,
      commitSha: codeMap.commitSha,
      createdAt: codeMap.createdAt.toISO() ?? '',
    },
    counts: {
      error: checked.reduce((sum, item) => sum + item.counts.error, 0),
      warning: checked.reduce((sum, item) => sum + item.counts.warning, 0),
    },
    diagrams: checked,
    notChecked: diagrams.length - checked.length,
    undocumentedProcesses: undocumentedProcesses(codeMap, map, matches).total,
  }
}
