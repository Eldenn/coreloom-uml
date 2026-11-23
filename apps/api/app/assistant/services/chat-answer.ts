import logger from '@adonisjs/core/services/logger'
import {
  AssistantContextFull,
  type AssistantStreamOptions,
  chatWithAssistant,
  type LanguageModel,
  LlmCallError,
  runAssistantTools,
  withFile,
} from '@coreloom-uml/llm'
import { actionTools } from '#app/assistant/actions/registry'
import type { AssistantTargetKind, StoredAction } from '#app/assistant/constants/assistant'
import type AssistantConversation from '#app/assistant/models/assistant-conversation'
import type AssistantFile from '#app/assistant/models/assistant-file'
import { serializeMessage } from '#app/assistant/serializers/assistant-serializer'
import {
  assistantActionsEnabled,
  handoffOf,
  handoffTools,
  resolveContext,
  resolvePage,
} from '#app/assistant/services/assistant-actions'
import { conversationHistory } from '#app/assistant/services/assistant-context'
import {
  conversationFiles,
  filePassages,
  filesContext,
  fileTextReader,
  wholeFile,
} from '#app/assistant/services/conversation-files'
import { RepositorySession, withFilesRead } from '#app/assistant/services/repository-session'
import { storeExchange } from '#app/assistant/services/store-exchange'
import type { ChatOutput, HandoffOutput } from '#app/assistant/validators/assistant-output'
import { LlmFailureReason, llmFailure } from '#app/llm/services/language-models'
import { ProviderKind } from '#app/llm-connections/constants/llm-connections'
import { HttpStatus } from '#app/shared/http/http-status'
import type User from '#app/users/models/user'

export const CONTEXT_FULL = {
  error: { message: 'The conversation is too long for the model.', code: 'context_full' },
} as const

type Target = { kind: AssistantTargetKind; id: number }

/** What the chat route resolved before the model call. */
export type ChatAnswerInput = {
  user: User
  conversation: AssistantConversation
  model: LanguageModel
  providerKind: string
  message: string
  locale: Parameters<typeof chatWithAssistant>[1]['locale']
  page: Target | undefined
  context: readonly Target[] | undefined
  auto: boolean | undefined
  fileId: number | undefined
  attached: AssistantFile | null
  log: Record<string, unknown>
}

/** The route's answer, as a status and a body, so it can go out as JSON or close a stream. */
export type ChatAnswer =
  | { status: HttpStatus.Ok; body: ChatOutput }
  | { status: HttpStatus.UnprocessableEntity; body: typeof CONTEXT_FULL }
  | { status: HttpStatus.BadGateway; body: ReturnType<typeof llmFailure> }

const failed = (reason: LlmFailureReason): ChatAnswer => ({
  status: HttpStatus.BadGateway,
  body: llmFailure(reason),
})

/**
 * Answers a message about no architecture and stores the exchange (see `chat` in
 * `assistant-messages-controller.ts`). With `stream.onChunk` the reply is streamed as it is
 * written; when `stream.abortSignal` aborts (the owner went away), nothing is stored.
 */
export async function answerChat(
  input: ChatAnswerInput,
  stream: AssistantStreamOptions,
): Promise<ChatAnswer> {
  const { user, conversation, message, locale, fileId, attached, log } = input
  // The ChatGPT subscription is not known to carry a tool call from one step to the next.
  const withTools =
    input.auto === true &&
    input.providerKind !== ProviderKind.OpenAICodex &&
    (await assistantActionsEnabled(user))
  const history = await conversationHistory(conversation)
  const files = await conversationFiles(conversation.id)
  const read = fileTextReader()
  // A short file the message attaches goes whole with it; the others by their summaries.
  const whole = await wholeFile(attached, read)
  const sent = withFile(message, whole)
  const recorded: StoredAction[] = []
  let actions: StoredAction[] = []
  const started = performance.now()
  let reply: string
  let handoff: HandoffOutput | null = null
  let unfinished = false
  // Opened by the first repository tool, paused once the message is answered (or failed).
  const repository = new RepositorySession(user, conversation.id)
  try {
    if (withTools) {
      const tools = [
        ...(await actionTools(user, recorded, {
          conversationId: conversation.id,
          read,
          repository,
        })),
        ...(await handoffTools(user)),
      ]
      // With tools, the model reads the files itself (`file-actions.ts`).
      const result = await runAssistantTools(
        input.model,
        {
          history,
          files: filesContext(files),
          message: sent,
          locale,
          page: await resolvePage(input.page, user),
          context: await resolveContext(input.context, user),
          tools,
        },
        stream,
      )
      reply = withFilesRead(result.reply, repository.read, locale)
      unfinished = result.unfinished
      // Recorded by the tools as the loop went, in the same order: keep the ones the loop kept.
      actions = recorded.slice(0, result.proposed.length)
      if (result.route) handoff = handoffOf(result.route)
    } else {
      // Without tools, it reads them through the passages its message is about.
      const passages = await filePassages(
        files.filter((item) => !whole || item.id !== fileId),
        message,
        read,
      )
      reply = await chatWithAssistant(
        input.model,
        { history, files: filesContext(files), passages, message: sent, locale },
        stream,
      )
    }
  } catch (error) {
    const durationMs = Math.round(performance.now() - started)
    if (error instanceof AssistantContextFull) {
      logger.info({ ...log, durationMs }, 'assistant chat refused: context full')
      return { status: HttpStatus.UnprocessableEntity, body: CONTEXT_FULL }
    }
    if (!(error instanceof LlmCallError)) throw error
    // Stopped by the owner: not a failure of the provider.
    if (stream.abortSignal?.aborted) {
      logger.info({ ...log, durationMs }, 'assistant chat abandoned')
      return failed(error.reason)
    }
    logger.warn({ ...log, durationMs, reason: error.reason }, 'assistant chat failed')
    return failed(error.reason)
  } finally {
    await repository.close()
  }
  const durationMs = Math.round(performance.now() - started)
  if (stream.abortSignal?.aborted) {
    logger.info({ ...log, durationMs }, 'assistant chat abandoned')
    return failed(LlmFailureReason.Timeout)
  }
  if (handoff) {
    logger.info({ ...log, durationMs, handoff: handoff.kind }, 'assistant chat handed over')
    return { status: HttpStatus.Ok, body: { messages: [], handoff, unfinished: false } }
  }
  if (!reply.trim() && actions.length === 0) {
    // A blank answer would be stored as an empty bubble: answered like any failed call.
    logger.warn({ ...log, durationMs, reason: LlmFailureReason.Unknown }, 'assistant chat failed')
    return failed(LlmFailureReason.Unknown)
  }
  logger.info(
    {
      ...log,
      durationMs,
      tools: withTools,
      actions: actions.map((action) => action.name),
      // A count only: never a path or what a file holds.
      repositoryFiles: repository.read.length,
      unfinished,
      streamed: stream.onChunk !== undefined,
    },
    'assistant chat',
  )

  const messages = await storeExchange(conversation, message, {
    architectureId: null,
    content: reply,
    actions,
    fileName: attached?.name,
  })
  return {
    status: HttpStatus.Ok,
    body: { messages: messages.map(serializeMessage), handoff: null, unfinished },
  }
}
