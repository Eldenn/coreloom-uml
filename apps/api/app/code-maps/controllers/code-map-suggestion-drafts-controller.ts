import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { type DrawingResult, LlmCallError } from '@coreloom-uml/llm'
import {
  ARCHITECTURE_NOT_FOUND,
  findOwnedArchitecture,
} from '#app/architectures/services/owned-architecture'
import { ChangeStatus } from '#app/assistant/constants/assistant'
import {
  serializeConversation,
  serializeMessage,
} from '#app/assistant/serializers/assistant-serializer'
import { ASSISTANT_NOT_FOUND, assistantEnabled } from '#app/assistant/services/assistant-flag'
import { CodeMapStatus, CodeMapSuggestionStatus } from '#app/code-maps/constants/code-map'
import { serializeSuggestion } from '#app/code-maps/serializers/code-map-suggestion-serializer'
import { readDetectedCodeMap } from '#app/code-maps/services/code-map-storage'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { readSource, withSourceSentence } from '#app/code-maps/services/code-source'
import { drawingSource } from '#app/code-maps/services/drawing-source'
import { findOwnedSuggestion, SUGGESTION_NOT_FOUND } from '#app/code-maps/services/owned-suggestion'
import {
  createProposalConversation,
  proposedChange,
} from '#app/code-maps/services/proposal-conversation'
import { draftSuggestionInput } from '#app/code-maps/validators/code-maps-input'
import type { DraftSuggestionOutput } from '#app/code-maps/validators/code-maps-output'
import { llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'

/** What the stored request reads, in the interface's language. */
const REQUEST = {
  en: {
    kinds: {
      package: 'package',
      component: 'component',
      class: 'class',
      sequence: 'sequence',
      activity: 'activity',
    },
    text: (title: string, kind: string) =>
      `Draw the proposed view “${title}” as a ${kind} diagram.`,
    noSummary: 'Here is the proposed view, drawn from the code map.',
  },
  fr: {
    kinds: {
      package: 'paquetages',
      component: 'composants',
      class: 'classes',
      sequence: 'séquence',
      activity: 'activité',
    },
    text: (title: string, kind: string) =>
      `Dessiner la vue proposée « ${title} » en diagramme de ${kind}.`,
    noSummary: 'Voici la vue proposée, tirée de la carte du code.',
  },
} as const

const PART_NOT_FOUND = {
  error: { message: 'The code this proposal covers is not in the map' },
} as const

/**
 * A proposed diagram drawn by the owner's own model as a new view of one of the project's
 * architectures: a process from its start, a structure from its folders or classes. The view
 * lands in a new conversation of that architecture's assistant, to accept or reject like any
 * other change; accepting it links its elements to the code. The key is used for this call only.
 * Session only, behind both `code-maps` and `diagram-assistant`.
 */
export default class CodeMapSuggestionDraftsController {
  /** `POST /code-map-suggestions/:id/draft` */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const suggestion = await findOwnedSuggestion(params.id, user)
    if (!suggestion) return response.notFound(SUGGESTION_NOT_FOUND)
    const { codeMap } = suggestion
    if (codeMap.status !== CodeMapStatus.Ready || !codeMap.storageKey) {
      return response.conflict({ error: { message: 'This code map is not ready' } })
    }

    const { provider, apiKey, architectureId, locale } =
      await request.validateUsing(draftSuggestionInput)
    const architecture = await findOwnedArchitecture(architectureId, user, { withDiagrams: true })
    if (!architecture || architecture.projectId !== codeMap.projectId) {
      return response.notFound(ARCHITECTURE_NOT_FOUND)
    }
    const map = await readDetectedCodeMap(codeMap.storageKey)
    const source = drawingSource(map, suggestion, architecture, locale)
    if (!source) return response.notFound(PART_NOT_FOUND)

    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)
    const log = {
      codeMapId: codeMap.id,
      suggestionId: suggestion.id,
      architectureId,
      kind: provider.kind,
      model: provider.model,
    }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'proposal draft failed')
      return response.badGateway(llmFailure(built.reason))
    }

    const started = performance.now()
    const reading = await readSource(codeMap, user, source.sourceNodes)
    let result: DrawingResult
    try {
      result = await source.draw(built.model, reading?.excerpts)
    } catch (error) {
      if (!(error instanceof LlmCallError)) throw error
      const durationMs = Math.round(performance.now() - started)
      logger.warn({ ...log, durationMs, reason: error.reason }, 'proposal draft failed')
      return response.badGateway(llmFailure(error.reason))
    }
    const change = proposedChange(result, suggestion.kind, architecture.diagrams)
    logger.info(
      {
        ...log,
        durationMs: Math.round(performance.now() - started),
        nodes: source.nodes,
        omittedNodes: result.omittedNodes,
        failed: change.status === ChangeStatus.Failed,
        links: change.codeLinks?.length ?? 0,
      },
      'proposal draft',
    )

    const words = REQUEST[locale]
    const { conversation, messages } = await createProposalConversation({
      architecture,
      userId: user.id,
      title: result.title || suggestion.title,
      request: words.text(suggestion.title, words.kinds[suggestion.kind]),
      summary: withSourceSentence(result.summary || words.noSummary, reading, locale),
      change,
    })
    suggestion.merge({
      status: CodeMapSuggestionStatus.Drafted,
      architectureId: architecture.id,
      conversationId: conversation.id,
    })
    await suggestion.save()

    return response.created({
      architectureId: architecture.id,
      conversation: serializeConversation(conversation),
      messages: messages.map(serializeMessage),
      suggestion: serializeSuggestion(suggestion),
    } satisfies DraftSuggestionOutput)
  }
}
