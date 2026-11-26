import vine from '@vinejs/vine'
import { LLM_API_KEY_MAX_LENGTH, LLM_BASE_URL_MAX_LENGTH } from '#app/llm/constants/llm'

/**
 * The code the user copied from Claude's sign-in page, passed as is to the binary's stdin: printable
 * ASCII on one line only, so it cannot feed the binary a second line.
 */
export const claudeCodeInput = vine.create(
  vine.object({
    code: vine
      .string()
      .trim()
      .regex(/^[\x21-\x7E]{1,500}$/),
  }),
)

/**
 * A provider key the account saves: printable ASCII on one line only (no space, control character
 * or line break, so it cannot leak into a header or a log line), stored only after the controller
 * checked it with a successful test call. A kind that calls a server the user names may take none
 * (`requiresApiKey` is false).
 */
export const saveApiKeyInput = vine.create(
  vine.object({
    apiKey: vine
      .string()
      .trim()
      .minLength(16)
      .maxLength(LLM_API_KEY_MAX_LENGTH)
      .regex(/^[\x21-\x7E]+$/)
      .nullable()
      .optional(),
    baseUrl: vine.string().trim().maxLength(LLM_BASE_URL_MAX_LENGTH).nullable().optional(),
  }),
)
