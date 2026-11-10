import vine from '@vinejs/vine'
import {
  ASSISTANT_LOCALES,
  ASSISTANT_MESSAGE_MAX_LENGTH,
  ASSISTANT_TITLE_MAX_LENGTH,
} from '#app/assistant/constants/assistant'
import { llmCallFields } from '#app/llm/validators/llm-input'

const titleInput = () => vine.string().trim().minLength(1).maxLength(ASSISTANT_TITLE_MAX_LENGTH)

/** `GET …/assistant/conversations` query params. */
export const listConversationsInput = vine.create(
  vine.object({
    page: vine.number().withoutDecimals().min(1).optional(),
    perPage: vine.number().withoutDecimals().min(1).optional(),
  }),
)

/** `POST …/assistant/conversations` — an empty conversation; the title may come later. */
export const createConversationInput = vine.create(vine.object({ title: titleInput().optional() }))

/** `PATCH …/assistant/conversations/:conversationId` */
export const renameConversationInput = vine.create(vine.object({ title: titleInput() }))

/** The views the next message would send: the current one first, `diagramIds` (all when absent). */
const viewSelection = () => ({
  currentDiagramId: vine.number().withoutDecimals().positive().nullable(),
  diagramIds: vine.array(vine.number().withoutDecimals().positive()).distinct().optional(),
  locale: vine.enum(ASSISTANT_LOCALES),
})

/** `POST …/assistant/conversations/:conversationId/messages` */
export const askAssistantInput = vine.create(
  vine.object({
    ...llmCallFields(),
    message: vine.string().trim().minLength(1).maxLength(ASSISTANT_MESSAGE_MAX_LENGTH),
    ...viewSelection(),
  }),
)

/** `POST …/assistant/conversations/:conversationId/context` — no model call. */
export const assistantContextInput = vine.create(
  vine.object({
    message: vine.string().trim().maxLength(ASSISTANT_MESSAGE_MAX_LENGTH).optional(),
    ...viewSelection(),
  }),
)

/** `POST …/assistant/conversations/:conversationId/continue` — the model summarizes the history. */
export const continueConversationInput = vine.create(
  vine.object({ ...llmCallFields(), locale: vine.enum(ASSISTANT_LOCALES) }),
)
