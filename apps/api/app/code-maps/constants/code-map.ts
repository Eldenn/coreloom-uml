/** Where a code map came from. */
export const CodeMapSource = {
  /** Sent by the CLI with an API token. */
  Cli: 'cli',
  /** Uploaded from the web app (a graphify `graph.json`). */
  Upload: 'upload',
  /** Extracted by the server from a GitHub repository (not yet). */
  Github: 'github',
} as const
export type CodeMapSource = (typeof CodeMapSource)[keyof typeof CodeMapSource]
export const CODE_MAP_SOURCES = Object.values(CodeMapSource)

/**
 * Where an extraction stands. An upload is read in the request, so it is `ready` (or refused)
 * at once; `pending` and `running` are for extractions the server runs itself.
 */
export const CodeMapStatus = {
  Pending: 'pending',
  Running: 'running',
  Ready: 'ready',
  Failed: 'failed',
} as const
export type CodeMapStatus = (typeof CodeMapStatus)[keyof typeof CodeMapStatus]
export const CODE_MAP_STATUSES = Object.values(CodeMapStatus)

/** The owner's decision about a diagram element and a place in the code. */
export const DiagramCodeLinkStatus = {
  Suggested: 'suggested',
  Confirmed: 'confirmed',
  Ignored: 'ignored',
} as const
export type DiagramCodeLinkStatus =
  (typeof DiagramCodeLinkStatus)[keyof typeof DiagramCodeLinkStatus]
export const DIAGRAM_CODE_LINK_STATUSES = Object.values(DiagramCodeLinkStatus)

export const CODE_MAP_LIMITS = {
  /** Maps kept per project: storing a sixth deletes the oldest, with its file. */
  perProject: 5,
  /** An uploaded file, `graph.json` or `.json.gz`. Also the multipart limit in `config/bodyparser.ts`. */
  uploadSize: '50mb',
  /** What a gzipped upload may inflate to before it is refused. */
  inflatedBytes: 150 * 1024 * 1024,
  repositoryUrl: 1024,
  branch: 200,
  elementId: 200,
  /** `CODE_MAP_LIMITS.path + name + 32` in `@coreloom-uml/codemap`, with room to spare. */
  codeKey: 1300,
  /** Links one diagram may hold. */
  linksPerDiagram: 2000,
} as const

/** File extensions accepted for an upload: `graph.json`, or it gzipped. */
export const CODE_MAP_UPLOAD_EXTENSIONS = ['json', 'gz'] as const

/** Folder of the stored maps in Drive: `code-maps/<projectId>/<uuid>.json.gz`. */
export const CODE_MAP_STORAGE_FOLDER = 'code-maps'
