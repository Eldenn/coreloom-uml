import type CodeMap from '#app/code-maps/models/code-map'
import type DiagramCodeLink from '#app/code-maps/models/diagram-code-link'
import type {
  CodeMapOutput,
  DiagramCodeLinkOutput,
} from '#app/code-maps/validators/code-maps-output'

export function serializeCodeMap(codeMap: CodeMap): CodeMapOutput {
  return {
    id: codeMap.id,
    projectId: codeMap.projectId,
    source: codeMap.source,
    repositoryUrl: codeMap.repositoryUrl,
    branch: codeMap.branch,
    commitSha: codeMap.commitSha,
    extractor: codeMap.extractor,
    extractorVersion: codeMap.extractorVersion,
    status: codeMap.status,
    failureReason: codeMap.failureReason,
    nodeCount: codeMap.nodeCount,
    edgeCount: codeMap.edgeCount,
    createdAt: codeMap.createdAt.toISO() ?? '',
    updatedAt: codeMap.updatedAt.toISO() ?? '',
  }
}

export function serializeDiagramCodeLink(link: DiagramCodeLink): DiagramCodeLinkOutput {
  return { elementId: link.elementId, codeKey: link.codeKey, status: link.status }
}
