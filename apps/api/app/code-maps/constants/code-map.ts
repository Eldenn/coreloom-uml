/** Where a code map came from. */
export const CodeMapSource = {
  /** Sent by the CLI with an API token. */
  Cli: 'cli',
  /** Uploaded from the web app (a graphify `graph.json`). */
  Upload: 'upload',
  /**
   * Extracted by the server from a GitHub repository (in a sandbox): a public one, or one
   * the owner reads through the GitHub App.
   */
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
 * The queue of GitHub extractions (`config/queue.ts`): one at a time, each in its own sandbox.
 */
export const CODE_MAPS_QUEUE = 'code-maps' as const

/** The extractor the sandbox runs. */
export const GITHUB_EXTRACTOR = 'graphify'

/** Why a repository cannot be mapped (`services/code-map-extraction.ts`). */
export const ExtractionError = {
  NotFound: 'not_found',
  TooLarge: 'too_large',
  TooManyFiles: 'too_many_files',
  Timeout: 'timeout',
  ExtractionFailed: 'extraction_failed',
} as const
export type ExtractionError = (typeof ExtractionError)[keyof typeof ExtractionError]

/** The `failureReason` shown for each refusal, and for the cases the job itself gives up on. */
export const GITHUB_IMPORT_FAILURES = {
  [ExtractionError.NotFound]:
    'The repository or branch does not exist, or it is private and the GitHub App does not reach it.',
  [ExtractionError.TooLarge]: 'The repository is larger than 200 MB.',
  [ExtractionError.TooManyFiles]: 'The repository holds more than 20,000 files.',
  [ExtractionError.Timeout]: 'Reading the repository took more than 5 minutes.',
  [ExtractionError.ExtractionFailed]: 'graphify could not read the repository.',
  unreachable: 'The sandbox that reads the repository could not be reached. Try again later.',
  githubAccess:
    'The GitHub App no longer reaches this repository: install it on the repository again, then connect GitHub.',
  githubUnreachable:
    'GitHub could not be reached to read this private repository. Try again later.',
  storage: 'The map was read but could not be stored (file storage unreachable). Try again later.',
  unexpected: 'The map could not be stored. Try again later.',
  refused: 'The map graphify wrote was refused',
  stale: 'The repository was not read in time: no worker took the job. Try again.',
} as const

/**
 * Reading source files for a drawing or a review (`services/code-source.ts`): a sandbox of its
 * own, within the one request that then calls the model.
 */
export const SOURCE_READ_LIMITS = {
  /** The sandbox ends by itself after this, should the API die first. */
  sandboxTimeoutMs: 90_000,
  /** Past it nothing is read and the drawing goes on from the structure. */
  cloneTimeoutMs: 30_000,
} as const

export const GITHUB_IMPORT_LIMITS = {
  /** The sandbox of one import ends by itself after this, should the worker die first. */
  sandboxTimeoutMs: 8 * 60 * 1000,
  cloneTimeoutMs: 2 * 60 * 1000,
  /** graphify on the clone. */
  mapTimeoutMs: 5 * 60 * 1000,
  /** Files in the clone, its history left out. */
  maxFiles: 20_000,
  /**
   * A map still `pending` or `running` after this long is failed when a new import starts: the
   * job's attempts (5 minutes each, with retries) are long over, or no worker ever took it.
   */
  staleMinutes: 30,
  /** graphify's graph, gzipped. */
  graphBytes: 50 * 1024 * 1024,
} as const

/** What the owner did with a diagram the model proposed for the map. */
export const CodeMapSuggestionStatus = {
  Open: 'open',
  /** Drawn by the model as a new view, waiting in (or accepted from) an assistant conversation. */
  Drafted: 'drafted',
  Dismissed: 'dismissed',
} as const
export type CodeMapSuggestionStatus =
  (typeof CodeMapSuggestionStatus)[keyof typeof CodeMapSuggestionStatus]
export const CODE_MAP_SUGGESTION_STATUSES = Object.values(CodeMapSuggestionStatus)

export const CODE_MAP_SUGGESTION_LIMITS = {
  title: 200,
  /** Keys kept per suggestion (`SUGGESTION_FOCUS_MAX` in `@coreloom-uml/llm`). */
  focus: 12,
} as const
