/** Where a code map came from. */
export const CodeMapSource = {
  /** Sent by the CLI with an API token. */
  Cli: 'cli',
  /** Uploaded from the web app (a graphify `graph.json`). */
  Upload: 'upload',
  /** Extracted by the server from a public GitHub repository (the analyzer service). */
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
  /** `code_maps.failure_reason`. */
  failureReason: 500,
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

/**
 * The queue of GitHub extractions (`config/queue.ts`): one at a time, since the analyzer maps one
 * repository at a time.
 */
export const CODE_MAPS_QUEUE = 'code-maps' as const

/** The extractor the analyzer runs, until it answers with its version. */
export const GITHUB_EXTRACTOR = 'graphify'

/** What the analyzer answers when a repository cannot be mapped (`apps/analyzer`, `ERRORS`). */
export const AnalyzerError = {
  NotFound: 'not_found',
  TooLarge: 'too_large',
  TooManyFiles: 'too_many_files',
  Timeout: 'timeout',
  ExtractionFailed: 'extraction_failed',
} as const
export type AnalyzerError = (typeof AnalyzerError)[keyof typeof AnalyzerError]

/** The `failureReason` shown for each refusal, and for the cases the job itself gives up on. */
export const GITHUB_IMPORT_FAILURES = {
  [AnalyzerError.NotFound]: 'The repository or branch does not exist, or it is not public.',
  [AnalyzerError.TooLarge]: 'The repository is larger than 200 MB.',
  [AnalyzerError.TooManyFiles]: 'The repository holds more than 20,000 files.',
  [AnalyzerError.Timeout]: 'Reading the repository took more than 5 minutes.',
  [AnalyzerError.ExtractionFailed]: 'graphify could not read the repository.',
  unreachable: 'The code analyzer could not be reached. Try again later.',
  storage: 'The map was read but could not be stored (file storage unreachable). Try again later.',
  unexpected: 'The map could not be stored. Try again later.',
  refused: 'The map graphify wrote was refused',
  stale: 'The repository was not read in time: no worker took the job. Try again.',
} as const

export const GITHUB_IMPORT_LIMITS = {
  /** How long the worker waits for the analyzer (it stops itself after 5 minutes). */
  analyzerTimeoutMs: 6 * 60 * 1000,
  /**
   * A map still `pending` or `running` after this long is failed when a new import starts: the
   * job's attempts (5 minutes each, with retries) are long over, or no worker ever took it.
   */
  staleMinutes: 30,
  /** The analyzer's answer, gzipped. */
  responseBytes: 50 * 1024 * 1024,
} as const
