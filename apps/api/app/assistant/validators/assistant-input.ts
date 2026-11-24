import { FILE_DIGEST_MAX_LENGTH } from '@coreloom-uml/llm'
import vine from '@vinejs/vine'
import {
  ASSISTANT_CONTEXT_KINDS,
  ASSISTANT_CONTEXT_MAX,
  ASSISTANT_FILE_NAME_MAX_LENGTH,
  ASSISTANT_LOCALES,
  ASSISTANT_MESSAGE_MAX_LENGTH,
  ASSISTANT_TARGET_KINDS,
  ASSISTANT_TITLE_MAX_LENGTH,
  POINTED_LABEL_MAX_LENGTH,
  POINTED_TYPES,
  PROPOSALS_ADDED_MAX,
} from '#app/assistant/constants/assistant'
import { llmCallFields } from '#app/llm/validators/llm-input'

const titleInput = () => vine.string().trim().minLength(1).maxLength(ASSISTANT_TITLE_MAX_LENGTH)

/** `GET /assistant/conversations` query params. */
export const listConversationsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
  }),
)

/** `POST /assistant/conversations` — an empty conversation; the title may come later. */
export const createConversationInput = vine.create(vine.object({ title: titleInput().optional() }))

/** `PATCH /assistant/conversations/:conversationId` */
export const renameConversationInput = vine.create(vine.object({ title: titleInput() }))

/** The views the next message would send: the current one first, `diagramIds` (all when absent). */
const viewSelection = () => ({
  currentDiagramId: vine.number().withoutDecimals().positive().nullable(),
  diagramIds: vine.array(vine.number().withoutDecimals().positive()).distinct().optional(),
  locale: vine.enum(ASSISTANT_LOCALES),
})

/**
 * A file of the conversation (`POST …/files` stored it) that this message attaches: a short one
 * goes whole with the message, a longer one by its summary and passages. Left out of a message
 * about a code map.
 */
const fileIdInput = () => vine.number().withoutDecimals().positive().optional()

/**
 * The parts of views the message is about (an element, a relation, a member, a step), each by the
 * view's id and the line that names it there. Never a position: a view changes between the click
 * and the message.
 */
const pointedInput = () =>
  vine
    .array(
      vine.object({
        diagramId: vine.number().withoutDecimals().positive(),
        type: vine.enum(POINTED_TYPES),
        label: vine.string().trim().minLength(1).maxLength(POINTED_LABEL_MAX_LENGTH),
      }),
    )
    .maxLength(ASSISTANT_CONTEXT_MAX)
    .optional()

/** `POST /assistant/conversations/:conversationId/files` — a file attached to the conversation. */
export const attachFileInput = vine.create(
  vine.object({
    ...llmCallFields(),
    file: vine.object({
      name: vine.string().trim().minLength(1).maxLength(ASSISTANT_FILE_NAME_MAX_LENGTH),
      content: vine.string().minLength(1).maxLength(FILE_DIGEST_MAX_LENGTH),
    }),
  }),
)

/** `POST /architectures/:id/assistant/conversations/:conversationId/messages` */
export const askAssistantInput = vine.create(
  vine.object({
    ...llmCallFields(),
    message: vine.string().trim().minLength(1).maxLength(ASSISTANT_MESSAGE_MAX_LENGTH),
    fileId: fileIdInput(),
    ...viewSelection(),
    pointed: pointedInput(),
    /** A ready code map of the architecture's project: the message asks for a diagram of it. */
    codeMapId: vine.number().withoutDecimals().positive().optional(),
    /**
     * The message was stored by its reading (`POST …/readings`) just before: only the answer is
     * stored now, after the reading in the history.
     */
    afterReading: vine.boolean().optional(),
  }),
)

/**
 * `POST /architectures/:id/assistant/conversations/:conversationId/readings` — what a message
 * about the views needs, read with the read tools before the views are drawn.
 */
export const readingInput = vine.create(
  vine.object({
    ...llmCallFields(),
    message: vine.string().trim().minLength(1).maxLength(ASSISTANT_MESSAGE_MAX_LENGTH),
    locale: vine.enum(ASSISTANT_LOCALES),
    fileId: fileIdInput(),
    pointed: pointedInput(),
  }),
)

/** `POST /architectures/:id/assistant/conversations/:conversationId/context` — no model call. */
export const assistantContextInput = vine.create(
  vine.object({
    message: vine.string().trim().maxLength(ASSISTANT_MESSAGE_MAX_LENGTH).optional(),
    ...viewSelection(),
  }),
)

/** `POST /assistant/conversations/:conversationId/continue` — the model summarizes the history. */
export const continueConversationInput = vine.create(
  vine.object({ ...llmCallFields(), locale: vine.enum(ASSISTANT_LOCALES) }),
)

/** `POST /assistant/conversations/:conversationId/messages` — a message about no architecture. */
export const chatInput = vine.create(
  vine.object({
    ...llmCallFields(),
    message: vine.string().trim().minLength(1).maxLength(ASSISTANT_MESSAGE_MAX_LENGTH),
    locale: vine.enum(ASSISTANT_LOCALES),
    fileId: fileIdInput(),
    /**
     * The owner lets the assistant decide what the message needs (actions, diagrams, the web).
     * Without it the message is a plain one, whatever the flags.
     */
    auto: vine.boolean().optional(),
    /** The page the message is written from, for "here" to mean something. */
    page: vine
      .object({
        kind: vine.enum(ASSISTANT_TARGET_KINDS),
        id: vine.number().withoutDecimals().positive(),
      })
      .optional(),
    /** What the owner put in the message's context: the work it is about, read in "Auto". */
    context: vine
      .array(
        vine.object({
          kind: vine.enum(ASSISTANT_CONTEXT_KINDS),
          id: vine.number().withoutDecimals().positive(),
        }),
      )
      .maxLength(ASSISTANT_CONTEXT_MAX)
      .optional(),
    pointed: pointedInput(),
    /**
     * The conversation is a design brief for this project of the caller's: in "Auto", the model
     * leads it to requirements, one decision, then views. Sent with every message of it.
     */
    brief: vine.object({ projectId: vine.number().withoutDecimals().positive() }).optional(),
  }),
)

/** `POST …/messages/:messageId/proposals/settle` — how many of the proposed rules were added. */
export const settleProposalsInput = vine.create(
  vine.object({ added: vine.number().withoutDecimals().min(0).max(PROPOSALS_ADDED_MAX) }),
)
