import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { processSlice } from '@coreloom-uml/codemap'
import { LlmCallError, type ProcessDiagramResult, proposeProcessDiagram } from '@coreloom-uml/llm'
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
import { CodeMapStatus } from '#app/code-maps/constants/code-map'
import { readDetectedCodeMap } from '#app/code-maps/services/code-map-storage'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { readSource, withSourceSentence } from '#app/code-maps/services/code-source'
import { CODE_MAP_NOT_FOUND, findOwnedCodeMap } from '#app/code-maps/services/owned-code-map'
import {
  createProposalConversation,
  proposedChange,
} from '#app/code-maps/services/proposal-conversation'
import { proposeProcessInput } from '#app/code-maps/validators/code-maps-input'
import type { ProposeProcessOutput } from '#app/code-maps/validators/code-maps-output'
import { llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'

const PROCESS_NOT_FOUND = { error: { message: 'Process not found' } } as const

/** What the stored request reads, in the interface's language. */
const REQUEST = {
  en: {
    kinds: { sequence: 'sequence', activity: 'activity' },
    entries: { route: 'route', job: 'job', command: 'command', handler: 'handler' },
    text: (name: string, entry: string, kind: string) =>
      `Draw the process that starts at \`${name}\` (${entry}) as a ${kind} diagram.`,
    noSummary: 'Here is a diagram of this process, drawn from the code map.',
  },
  fr: {
    kinds: { sequence: 'séquence', activity: 'activité' },
    entries: { route: 'route', job: 'job', command: 'commande', handler: 'gestionnaire' },
    text: (name: string, entry: string, kind: string) =>
      `Dessiner le processus qui part de \`${name}\` (${entry}) en diagramme de ${kind}.`,
    noSummary: 'Voici un diagramme de ce processus, tiré de la carte du code.',
  },
} as const

/** `path/file.ts#Class.method` reads `Class.method`; a file reads its path. */
function entryName(key: string): string {
  const hash = key.indexOf('#')
  return hash === -1 ? key : key.slice(hash + 1)
}

/**
 * A process no diagram documents, drawn by the user's own model as a new view: the proposal lands
 * in a new conversation of the chosen architecture's assistant, where the owner accepts or rejects
 * it like any other. Accepting it links the view's elements to the code it was drawn from. The
 * key is used for this call only; the model reads names, paths and calls, and the
 * source of the files concerned when the repository can be read on GitHub (`readSource`).
 * Session only, behind both `code-maps` and `diagram-assistant`.
 */
export default class CodeMapProcessProposalsController {
  /** `POST /code-maps/:id/processes/propose` */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    if (!(await assistantEnabled(user))) return response.notFound(ASSISTANT_NOT_FOUND)
    const codeMap = await findOwnedCodeMap(params.id, user)
    if (!codeMap) return response.notFound(CODE_MAP_NOT_FOUND)
    if (codeMap.status !== CodeMapStatus.Ready || !codeMap.storageKey) {
      return response.conflict({ error: { message: 'This code map is not ready' } })
    }

    const { provider, apiKey, entry, architectureId, kind, locale } =
      await request.validateUsing(proposeProcessInput)
    const architecture = await findOwnedArchitecture(architectureId, user, { withDiagrams: true })
    if (!architecture || architecture.projectId !== codeMap.projectId) {
      return response.notFound(ARCHITECTURE_NOT_FOUND)
    }
    const map = await readDetectedCodeMap(codeMap.storageKey)
    const slice = processSlice(map, entry)
    if (!slice) return response.notFound(PROCESS_NOT_FOUND)

    const built = await userLanguageModel(provider, apiKey, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)
    const log = {
      codeMapId: codeMap.id,
      architectureId,
      kind: provider.kind,
      model: provider.model,
    }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'process proposal failed')
      return response.badGateway(llmFailure(built.reason))
    }

    const started = performance.now()
    const reading = await readSource(codeMap, user, slice.nodes)
    let result: ProcessDiagramResult
    try {
      result = await proposeProcessDiagram(built.model, {
        entry: slice.entry,
        entryKind: slice.entryKind,
        kind,
        nodes: slice.nodes,
        calls: slice.calls,
        architecture: architecture.title,
        titles: architecture.diagrams.map((diagram) => diagram.title),
        locale,
        sources: reading?.excerpts,
      })
    } catch (error) {
      if (!(error instanceof LlmCallError)) throw error
      const durationMs = Math.round(performance.now() - started)
      logger.warn({ ...log, durationMs, reason: error.reason }, 'process proposal failed')
      return response.badGateway(llmFailure(error.reason))
    }
    const change = proposedChange(result, kind, architecture.diagrams)
    logger.info(
      {
        ...log,
        durationMs: Math.round(performance.now() - started),
        nodes: slice.nodes.length,
        omittedNodes: result.omittedNodes,
        failed: change.status === ChangeStatus.Failed,
        links: change.codeLinks?.length ?? 0,
      },
      'process proposal',
    )

    const words = REQUEST[locale]
    const name = entryName(slice.entry)
    const { conversation, messages } = await createProposalConversation({
      architecture,
      userId: user.id,
      title: result.title || name,
      request: words.text(name, words.entries[slice.entryKind], words.kinds[kind]),
      summary: withSourceSentence(result.summary || words.noSummary, reading, locale),
      change,
    })

    return response.created({
      architectureId: architecture.id,
      conversation: serializeConversation(conversation),
      messages: messages.map(serializeMessage),
    } satisfies ProposeProcessOutput)
  }
}
