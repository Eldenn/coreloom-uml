import vine from '@vinejs/vine'
import { ASSISTANT_TITLE_MAX_LENGTH } from '#app/assistant/constants/assistant'

const titleInput = () => vine.string().trim().minLength(1).maxLength(ASSISTANT_TITLE_MAX_LENGTH)

/** `POST …/assistant/conversations` — an empty conversation; the title may come later. */
export const createConversationInput = vine.create(vine.object({ title: titleInput().optional() }))

/** `PATCH …/assistant/conversations/:conversationId` */
export const renameConversationInput = vine.create(vine.object({ title: titleInput() }))
