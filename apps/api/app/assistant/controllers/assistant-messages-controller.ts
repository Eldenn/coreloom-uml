import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import {
  AssistantContextFull,
  AssistantToolKind,
  askAssistant,
  assistantBudget,
  chatWithAssistant,
  LlmCallError,
  NOTHING_TO_READ,
  runAssistantTools,
  withFile,
} from '@coreloom-uml/llm'
import { actionTools } from '#app/assistant/actions/registry'
import {
  AssistantRole,
  AssistantTargetKind,
  ChangeStatus,
  type StoredAction,
} from '#app/assistant/constants/assistant'
import AssistantMessage from '#app/assistant/models/assistant-message'
import { serializeMessage } from '#app/assistant/serializers/assistant-serializer'
import {
  assistantActionsEnabled,
  handoffOf,
  handoffTools,
  pointedIn,
  resolveContext,
  resolvePage,
  resolvePointed,
} from '#app/assistant/services/assistant-actions'
import {
  assistantSource,
  conversationHistory,
  selectsOwnViews,
} from '#app/assistant/services/assistant-context'
import { ASSISTANT_NOT_FOUND, assistantEnabled } from '#app/assistant/services/assistant-flag'
import { answerFromCode, type CodeAnswer } from '#app/assistant/services/code-request'
import {
  conversationFiles,
  FILE_NOT_FOUND,
  filePassages,
  filesContext,
  fileTextReader,
  findConversationFile,
  wholeFile,
} from '#app/assistant/services/conversation-files'
import {
  CONVERSATION_NOT_FOUND,
  findArchitectureConversation,
  findOwnedConversation,
} from '#app/assistant/services/owned-conversation'
import { RepositorySession, withFilesRead } from '#app/assistant/services/repository-session'
import { storeExchange } from '#app/assistant/services/store-exchange'
import { storedChange } from '#app/assistant/services/stored-change'
import {
  askAssistantInput,
  assistantContextInput,
  chatInput,
  readingInput,
} from '#app/assistant/validators/assistant-input'
import type {
  AskAssistantOutput,
  ChatOutput,
  HandoffOutput,
  ReadingOutput,
} from '#app/assistant/validators/assistant-output'
import { CodeMapStatus } from '#app/code-maps/constants/code-map'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { CODE_MAP_NOT_FOUND, findOwnedCodeMap } from '#app/code-maps/services/owned-code-map'
import { DIAGRAM_NOT_FOUND } from '#app/diagrams/services/owned-diagram'
import { LlmFailureReason, llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import {
  ProviderKind,
  SUBSCRIPTION_NOT_FOUND,
} from '#app/llm-connections/constants/llm-connections'

const MESSAGE_NOT_FOUND = { error: { message: 'Message not found' } } as const
const NOT_A_SUMMARY = { error: { message: 'Only a summary can be deleted.' } } as const

const CODE_MAP_NOT_READY = { error: { message: 'This code map is not ready' } } as const

const CONTEXT_FULL = {
  error: { message: 'The conversation is too long for the model.', code: 'context_full' },
} as const

/**
 * The workspace assistant: the user's own model answers a message about the architecture's views
 * and proposes view changes, stored as `pending` for the owner to accept. Nothing here writes a
 * diagram. The exchange is stored only when the call succeeds, both messages about the
 * architecture of the route (the conversation itself is the account's). Session only.
 *
 * With `codeMapId` (a ready map of the architecture's project, behind `code-maps` too), the
 * message is a request for one diagram drawn from the code map instead: see `answerFromCode`.
 */
export default class AssistantMessagesController {
  /** `POST /architectures/:id/assistant/conversations/:conversationId/messages` */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const found = await findArchitectureConversation(params.id, params.conversationId, user)
    if (!found) return response.notFound(CONVERSATION_NOT_FOUND)
    const { architecture, conversation } = found

    const { provider, apiKey, codeMapId, fileId, afterReading, pointed, ...asked } =
      await request.validateUsing(askAssistantInput)
    if (!selectsOwnViews(architecture, asked)) return response.notFound(DIAGRAM_NOT_FOUND)
    // A part pointed at in a view that is not this architecture's is left out.
    const selection = { ...asked, pointed: pointedIn(pointed, architecture.diagrams) }
    const attached =
      fileId === undefined ? null : await findConversationFile(conversation.id, fileId)
    if (fileId !== undefined && !attached) return response.notFound(FILE_NOT_FOUND)

    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)

    const log = { conversationId: conversation.id, kind: provider.kind, model: provider.model }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'assistant message failed')
      return response.badGateway(llmFailure(built.reason))
    }
    if (codeMapId !== undefined) {
      if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
      const codeMap = await findOwnedCodeMap(codeMapId, user)
      // An architecture outside any project has no code map.
      if (
        !codeMap ||
        architecture.projectId === null ||
        codeMap.projectId !== architecture.projectId
      )
        return response.notFound(CODE_MAP_NOT_FOUND)
      const { storageKey } = codeMap
      if (codeMap.status !== CodeMapStatus.Ready || !storageKey)
        return response.conflict(CODE_MAP_NOT_READY)

      const started = performance.now()
      let answer: CodeAnswer
      try {
        answer = await answerFromCode({
          model: built.model,
          codeMap: Object.assign(codeMap, { storageKey }),
          architecture,
          conversation,
          user,
          message: selection.message,
          locale: selection.locale,
        })
      } catch (error) {
        if (!(error instanceof LlmCallError)) throw error
        const durationMs = Math.round(performance.now() - started)
        logger.warn(
          { ...log, codeMapId, durationMs, reason: error.reason },
          'assistant code message failed',
        )
        return response.badGateway(llmFailure(error.reason))
      }
      logger.info(
        {
          ...log,
          codeMapId,
          durationMs: Math.round(performance.now() - started),
          ...answer.log,
          failed: answer.change?.status === ChangeStatus.Failed,
          links: answer.change?.codeLinks?.length ?? 0,
        },
        'assistant code message',
      )
      const messages = await storeExchange(conversation, selection.message, {
        architectureId: architecture.id,
        content: answer.content,
        changes: answer.change ? [answer.change] : [],
        asked: afterReading !== true,
      })
      const next = await assistantSource(architecture, conversation, { ...selection, message: '' })
      return response.ok({
        messages: messages.map(serializeMessage),
        budget: assistantBudget(next),
        skipped: [],
      } satisfies AskAssistantOutput)
    }

    // The diagram assistant has no tool: what the request needs from the code was read just
    // before (`read`, in the history); the files beyond their summaries through the passages its
    // request is about. A short file the message attaches goes whole instead.
    const read = fileTextReader()
    const whole = await wholeFile(attached, read)
    const passages = await filePassages(
      (await conversationFiles(conversation.id)).filter((item) => !whole || item.id !== fileId),
      `${architecture.title} ${selection.message}`,
      read,
    )
    const source = await assistantSource(
      architecture,
      conversation,
      { ...selection, message: withFile(selection.message, whole) },
      passages,
    )
    const started = performance.now()
    let reply: Awaited<ReturnType<typeof askAssistant>>
    try {
      reply = await askAssistant(built.model, source)
    } catch (error) {
      const durationMs = Math.round(performance.now() - started)
      if (error instanceof AssistantContextFull) {
        logger.info({ ...log, durationMs }, 'assistant message refused: context full')
        return response.unprocessableEntity(CONTEXT_FULL)
      }
      if (!(error instanceof LlmCallError)) throw error
      logger.warn({ ...log, durationMs, reason: error.reason }, 'assistant message failed')
      return response.badGateway(llmFailure(error.reason))
    }
    const changes = reply.changes.map((change) => storedChange(change, architecture.diagrams))
    logger.info(
      {
        ...log,
        durationMs: Math.round(performance.now() - started),
        changes: changes.length,
        failed: changes.filter((change) => change.status === ChangeStatus.Failed).length,
        skipped: reply.skipped.length,
      },
      'assistant message',
    )

    const messages = await storeExchange(conversation, selection.message, {
      architectureId: architecture.id,
      content: reply.reply,
      changes,
      fileName: attached?.name,
      asked: afterReading !== true,
    })

    const next = await assistantSource(architecture, conversation, { ...selection, message: '' })
    return response.ok({
      messages: messages.map(serializeMessage),
      budget: assistantBudget(next),
      skipped: reply.skipped,
    } satisfies AskAssistantOutput)
  }

  /**
   * `POST /architectures/:id/assistant/conversations/:conversationId/readings` — before a message
   * about the views is answered (`store` with `afterReading`), the user's model reads what it
   * needs with the read tools of the assistant's actions (the project's repository and history,
   * its code maps, the conversation's files…; never a write or a handoff). The message and what
   * was read are stored as an exchange of the conversation, which the drawing reads in its
   * history; nothing is stored when the message needs nothing read. A request of its own, so the
   * reading and the drawing each fit in what the proxy allows one. Behind `assistant-actions`.
   */
  async read({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user)) || !(await assistantActionsEnabled(user)))
      return response.notFound(ASSISTANT_NOT_FOUND)
    const found = await findArchitectureConversation(params.id, params.conversationId, user)
    if (!found) return response.notFound(CONVERSATION_NOT_FOUND)
    const { architecture, conversation } = found

    const { provider, apiKey, message, locale, fileId, pointed } =
      await request.validateUsing(readingInput)
    const attached =
      fileId === undefined ? null : await findConversationFile(conversation.id, fileId)
    if (fileId !== undefined && !attached) return response.notFound(FILE_NOT_FOUND)
    // The ChatGPT subscription is not known to carry a tool call from one step to the next.
    if (provider.kind === ProviderKind.OpenAICodex)
      return response.ok({ messages: [], unfinished: false } satisfies ReadingOutput)
    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)

    const log = { conversationId: conversation.id, kind: provider.kind, model: provider.model }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'assistant reading failed')
      return response.badGateway(llmFailure(built.reason))
    }
    const read = fileTextReader()
    const whole = await wholeFile(attached, read)
    const recorded: StoredAction[] = []
    const repository = new RepositorySession(user, conversation.id)
    const started = performance.now()
    let reply: string
    let unfinished: boolean
    try {
      const tools = (
        await actionTools(user, recorded, { conversationId: conversation.id, read, repository })
      ).filter((tool) => tool.kind === AssistantToolKind.Read)
      // The project is what its code, maps and repository are read from.
      const page = await resolvePage(
        architecture.projectId === null
          ? { kind: AssistantTargetKind.Architecture, id: architecture.id }
          : { kind: AssistantTargetKind.Project, id: architecture.projectId },
        user,
      )
      const result = await runAssistantTools(built.model, {
        purpose: 'reading',
        history: await conversationHistory(conversation),
        files: filesContext(await conversationFiles(conversation.id)),
        message: withFile(
          `(about the views of the architecture ${JSON.stringify(architecture.title)})\n${message}`,
          whole,
        ),
        locale,
        page,
        pointed: pointedIn(pointed, architecture.diagrams),
        tools,
      })
      reply = result.reply
      unfinished = result.unfinished
    } catch (error) {
      const durationMs = Math.round(performance.now() - started)
      if (error instanceof AssistantContextFull) {
        logger.info({ ...log, durationMs }, 'assistant reading refused: context full')
        return response.unprocessableEntity(CONTEXT_FULL)
      }
      if (!(error instanceof LlmCallError)) throw error
      logger.warn({ ...log, durationMs, reason: error.reason }, 'assistant reading failed')
      return response.badGateway(llmFailure(error.reason))
    } finally {
      await repository.close()
    }
    const nothing =
      !reply.trim() || (reply.includes(NOTHING_TO_READ) && repository.read.length === 0)
    logger.info(
      {
        ...log,
        durationMs: Math.round(performance.now() - started),
        nothing,
        // A count only: never a path or what a file holds.
        repositoryFiles: repository.read.length,
        unfinished,
      },
      'assistant reading',
    )
    if (nothing) return response.ok({ messages: [], unfinished: false } satisfies ReadingOutput)
    const messages = await storeExchange(conversation, message, {
      architectureId: architecture.id,
      content: withFilesRead(reply, repository.read, locale),
      fileName: attached?.name,
    })
    return response.ok({
      messages: messages.map(serializeMessage),
      unfinished,
    } satisfies ReadingOutput)
  }

  /** `POST …/conversations/:conversationId/context` — the budget of a selection, no model call. */
  async context({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const found = await findArchitectureConversation(params.id, params.conversationId, user)
    if (!found) return response.notFound(CONVERSATION_NOT_FOUND)

    const { message, ...selection } = await request.validateUsing(assistantContextInput)
    const view = { ...selection, message: message ?? '' }
    if (!selectsOwnViews(found.architecture, view)) return response.notFound(DIAGRAM_NOT_FOUND)

    const source = await assistantSource(found.architecture, found.conversation, view)
    return response.ok({ budget: assistantBudget(source) })
  }

  /**
   * `POST /assistant/conversations/:conversationId/messages` — a message about no architecture:
   * the user's model answers from the conversation's history. Behind `assistant-actions` too (and
   * with a model that carries tool calls), it may read the account's work and propose actions,
   * stored `pending` for the owner to accept, or hand the message over (`handoff`): then nothing
   * is stored, and the screen sends the message again down that path.
   */
  async chat({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const conversation = await findOwnedConversation(params.conversationId, user)
    if (!conversation) return response.notFound(CONVERSATION_NOT_FOUND)

    const { provider, apiKey, message, locale, page, context, pointed, auto, fileId } =
      await request.validateUsing(chatInput)
    const attached =
      fileId === undefined ? null : await findConversationFile(conversation.id, fileId)
    if (fileId !== undefined && !attached) return response.notFound(FILE_NOT_FOUND)
    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)

    const log = { conversationId: conversation.id, kind: provider.kind, model: provider.model }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'assistant chat failed')
      return response.badGateway(llmFailure(built.reason))
    }
    // The ChatGPT subscription is not known to carry a tool call from one step to the next.
    const withTools =
      auto === true &&
      provider.kind !== ProviderKind.OpenAICodex &&
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
        const result = await runAssistantTools(built.model, {
          history,
          files: filesContext(files),
          message: sent,
          locale,
          page: await resolvePage(page, user),
          context: await resolveContext(context, user),
          pointed: await resolvePointed(pointed, user),
          tools,
        })
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
        reply = await chatWithAssistant(built.model, {
          history,
          files: filesContext(files),
          passages,
          message: sent,
          locale,
        })
      }
    } catch (error) {
      const durationMs = Math.round(performance.now() - started)
      if (error instanceof AssistantContextFull) {
        logger.info({ ...log, durationMs }, 'assistant chat refused: context full')
        return response.unprocessableEntity(CONTEXT_FULL)
      }
      if (!(error instanceof LlmCallError)) throw error
      logger.warn({ ...log, durationMs, reason: error.reason }, 'assistant chat failed')
      return response.badGateway(llmFailure(error.reason))
    } finally {
      await repository.close()
    }
    const durationMs = Math.round(performance.now() - started)
    if (handoff) {
      logger.info({ ...log, durationMs, handoff: handoff.kind }, 'assistant chat handed over')
      return response.ok({ messages: [], handoff, unfinished: false } satisfies ChatOutput)
    }
    if (!reply.trim() && actions.length === 0) {
      // A blank answer would be stored as an empty bubble: answered like any failed call.
      logger.warn({ ...log, durationMs, reason: LlmFailureReason.Unknown }, 'assistant chat failed')
      return response.badGateway(llmFailure(LlmFailureReason.Unknown))
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
      },
      'assistant chat',
    )

    const messages = await storeExchange(conversation, message, {
      architectureId: null,
      content: reply,
      actions,
      fileName: attached?.name,
    })
    return response.ok({
      messages: messages.map(serializeMessage),
      handoff: null,
      unfinished,
    } satisfies ChatOutput)
  }

  /** `DELETE /assistant/conversations/:conversationId/messages/:messageId` — a summary only. */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const conversation = await findOwnedConversation(params.conversationId, user)
    if (!conversation) return response.notFound(MESSAGE_NOT_FOUND)

    const message = await AssistantMessage.query()
      .where('id', params.messageId)
      .where('conversationId', conversation.id)
      .first()
    if (!message) return response.notFound(MESSAGE_NOT_FOUND)
    if (message.role !== AssistantRole.Summary) return response.conflict(NOT_A_SUMMARY)

    await message.delete()
    return response.noContent()
  }
}
