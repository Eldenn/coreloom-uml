export { normalizeModule } from './code-graph.ts'
export {
  CODE_MAP_LIMITS,
  CODE_MAP_VERSION,
  CONFIDENCES,
  type CodeConfidence,
  type CodeEdge,
  type CodeEdgeKind,
  type CodeMap,
  type CodeMapHeader,
  type CodeMapParseResult,
  type CodeNode,
  type CodeNodeKind,
  codeEdgeSchema,
  codeMapHeaderSchema,
  codeMapSchema,
  codeNodeSchema,
  EDGE_KINDS,
  ENTRY_KINDS,
  type EntryKind,
  folderKey,
  isFolderKey,
  NODE_KINDS,
  parseCodeMap,
} from './code-map.ts'
export { detectEntryPoints } from './entry-points.ts'
export {
  type CodeFlow,
  DEFAULT_FLOW_DEPTH,
  type FlowOptions,
  findUncoveredFlows,
  traceFlow,
} from './flows.ts'
export {
  cleanName,
  DEFAULT_IGNORED_FOLDERS,
  defaultGraphifyIgnore,
  GRAPHIFY_SCHEMA_VERSION,
  GRAPHIFY_TESTED_VERSION,
  type GraphifyImportOptions,
  type GraphifyImportResult,
  importGraphify,
} from './graphify.ts'
export {
  type DiagramCodeLink,
  type DiagramMatch,
  type ElementMatch,
  type LinkStatus,
  linkedCodeKeys,
  MAX_CANDIDATES,
  type MatchableDiagram,
  type MatchFinding,
  type MatchReason,
  matchDiagram,
  normalizeName,
  type RelationCheck,
} from './match.ts'
export { type CodeMapSummary, summarizeCodeMap } from './summary.ts'
