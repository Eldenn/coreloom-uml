import { PROCESS_DIAGRAM_KINDS } from '@coreloom-uml/llm'
import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'
import { ASSISTANT_LOCALES } from '#app/assistant/constants/assistant'
import {
  CODE_MAP_LIMITS,
  CODE_MAP_UPLOAD_EXTENSIONS,
  DIAGRAM_CODE_LINK_STATUSES,
} from '#app/code-maps/constants/code-map'
import { isValidBranch, parseGithubRepository } from '#app/code-maps/services/github-repository'
import { llmCallFields } from '#app/llm/validators/llm-input'

const idInput = () => vine.number().withoutDecimals().min(1)

/**
 * `POST /projects/:id/code-maps`, a multipart form: `file` is graphify's `graph.json` or a map the
 * CLI normalized, plain or gzipped, its size and extension checked here. The other fields, when
 * given, win over what the map says.
 */
export const createCodeMapInput = vine.create(
  vine.object({
    file: vine.file({
      size: CODE_MAP_LIMITS.uploadSize,
      extnames: [...CODE_MAP_UPLOAD_EXTENSIONS],
    }),
    repositoryUrl: vine
      .string()
      .trim()
      .url({ protocols: ['https', 'http'], require_protocol: true })
      .maxLength(CODE_MAP_LIMITS.repositoryUrl)
      .optional(),
    branch: vine.string().trim().minLength(1).maxLength(CODE_MAP_LIMITS.branch).optional(),
    commitSha: vine
      .string()
      .trim()
      .regex(/^[0-9a-f]{7,64}$/i)
      .optional(),
  }),
)

const githubRepository = vine.createRule(
  (value: unknown, _options: undefined, field: FieldContext) => {
    if (typeof value === 'string' && !parseGithubRepository(value)) {
      field.report(
        'The {{ field }} field must be a public GitHub repository, https://github.com/<owner>/<name>',
        'githubRepository',
        field,
      )
    }
  },
)

const gitBranch = vine.createRule((value: unknown, _options: undefined, field: FieldContext) => {
  if (typeof value === 'string' && !isValidBranch(value)) {
    field.report('The {{ field }} field is not a branch name', 'gitBranch', field)
  }
})

/**
 * `POST /projects/:id/code-maps/github`: a public repository on github.com, and its branch (the
 * default one when left out). The server clones and maps it in the background.
 */
export const importGithubCodeMapInput = vine.create(
  vine.object({
    url: vine.string().trim().maxLength(CODE_MAP_LIMITS.repositoryUrl).use(githubRepository()),
    branch: vine
      .string()
      .trim()
      .minLength(1)
      .maxLength(CODE_MAP_LIMITS.branch)
      .use(gitBranch())
      .optional(),
  }),
)

/** `GET /projects/:id/code-maps` query params. */
export const listCodeMapsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
  }),
)

/** `GET /code-maps/:id/links?diagramId=` */
/**
 * `GET /projects/:id/code-maps/conformance?codeMapId=`: a map of the project; its newest ready
 * one when left out.
 */
export const showCodeConformanceInput = vine.create(
  vine.object({
    codeMapId: idInput().optional(),
  }),
)

export const showCodeMapLinksInput = vine.create(
  vine.object({
    diagramId: idInput(),
  }),
)

/**
 * `PUT /code-maps/:id/links?diagramId=`: the diagram's links, all of them. A link left out is
 * deleted; the same element and code key twice is refused.
 */
export const updateCodeMapLinksInput = vine.create(
  vine.object({
    diagramId: idInput(),
    links: vine
      .array(
        vine.object({
          elementId: vine.string().minLength(1).maxLength(CODE_MAP_LIMITS.elementId),
          codeKey: vine.string().minLength(1).maxLength(CODE_MAP_LIMITS.codeKey),
          status: vine.enum(DIAGRAM_CODE_LINK_STATUSES),
        }),
      )
      .maxLength(CODE_MAP_LIMITS.linksPerDiagram),
  }),
)

/**
 * `POST /code-maps/:id/processes/propose`: draw the process from one entry point as a new view
 * of one of the project's architectures, with the user's own provider. The entry point is a node
 * key, sent in the body: keys hold slashes and `#`.
 */
export const proposeProcessInput = vine.create(
  vine.object({
    ...llmCallFields(),
    entry: vine.string().minLength(1).maxLength(CODE_MAP_LIMITS.codeKey),
    architectureId: idInput(),
    kind: vine.enum(PROCESS_DIAGRAM_KINDS),
    locale: vine.enum(ASSISTANT_LOCALES),
  }),
)
