import type { CodeMapSummary, DiagramMatch, EntryKind } from '@coreloom-uml/codemap'
import type { ConversationOutput, MessageOutput } from '#app/assistant/validators/assistant-output'
import type {
  CodeMapSource,
  CodeMapStatus,
  DiagramCodeLinkStatus,
} from '#app/code-maps/constants/code-map'
import type { Paginated } from '#app/shared/pagination/paginate'

/** JSON shape of a code map's header. The map itself is never sent whole. */
export type CodeMapOutput = {
  id: number
  projectId: number
  source: CodeMapSource
  repositoryUrl: string | null
  branch: string | null
  commitSha: string | null
  extractor: string
  extractorVersion: string
  status: CodeMapStatus
  failureReason: string | null
  nodeCount: number
  edgeCount: number
  createdAt: string
  updatedAt: string
}

/** `GET /code-maps/:id`: the header, and what the map holds when it is ready. */
export type CodeMapDetailOutput = CodeMapOutput & {
  /** Folders, communities, entry points (detected again on each read) and counts. */
  summary: CodeMapSummary | null
}

/** Shape returned by `GET /projects/:id/code-maps`, newest first. */
export type CodeMapsListOutput = Paginated<CodeMapOutput>

export type DiagramCodeLinkOutput = {
  elementId: string
  codeKey: string
  status: DiagramCodeLinkStatus
}

/** `GET|PUT /code-maps/:id/links?diagramId=`: the stored links and the match they lead to. */
export type CodeMapLinksOutput = {
  codeMapId: number
  diagramId: number
  links: DiagramCodeLinkOutput[]
  /** Elements and relations of the diagram against the map; confirmed links win. */
  match: DiagramMatch
}

/** A process no diagram documents: the calls followed from one entry point. */
export type CodeMapProcessOutput = {
  /** The entry point's node key. */
  entry: string
  entryKind: EntryKind
  /** Nodes the flow reaches, the entry included. */
  size: number
  /** Levels of calls the flow goes down. */
  depth: number
  /** Folders the flow goes through. */
  folders: string[]
  /** The first nodes of the flow (node keys), in the order the calls reach them. */
  nodes: string[]
}

/** `GET /code-maps/:id/processes`: the largest undocumented processes first. */
export type CodeMapProcessesOutput = {
  codeMapId: number
  /** How many processes are undocumented; only the largest are listed. */
  total: number
  processes: CodeMapProcessOutput[]
}

/**
 * `POST /code-maps/:id/processes/propose`: the conversation the proposal was put in, a new one in
 * the chosen architecture, and its two messages; the view waits there to be accepted.
 */
export type ProposeProcessOutput = {
  architectureId: number
  conversation: ConversationOutput
  messages: MessageOutput[]
}
