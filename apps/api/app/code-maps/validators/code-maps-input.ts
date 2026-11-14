import vine from '@vinejs/vine'
import {
  CODE_MAP_LIMITS,
  CODE_MAP_UPLOAD_EXTENSIONS,
  DIAGRAM_CODE_LINK_STATUSES,
} from '#app/code-maps/constants/code-map'

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

/** `GET /projects/:id/code-maps` query params. */
export const listCodeMapsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
  }),
)

/** `GET /code-maps/:id/links?diagramId=` */
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
