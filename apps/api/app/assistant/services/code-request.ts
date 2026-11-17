import { outlineCodeMap } from '@coreloom-uml/codemap'
import { type LanguageModel, resolveDiagramRequest } from '@coreloom-uml/llm'
import type Architecture from '#app/architectures/models/architecture'
import type { StoredChange } from '#app/assistant/constants/assistant'
import type AssistantConversation from '#app/assistant/models/assistant-conversation'
import { conversationHistory } from '#app/assistant/services/assistant-context'
import type CodeMap from '#app/code-maps/models/code-map'
import { readDetectedCodeMap } from '#app/code-maps/services/code-map-storage'
import { drawingSource, projectViews } from '#app/code-maps/services/drawing-source'
import { proposedChange } from '#app/code-maps/services/proposal-conversation'
import type User from '#app/users/models/user'

/** What the stored answer reads when the model gave no sentence of its own. */
const WORDS = {
  en: {
    nothing:
      'I found nothing in the code map that matches this request. Name a folder, a class, a function or a route.',
    noSummary: 'Here is the view, drawn from the code map.',
  },
  fr: {
    nothing:
      'Je n’ai rien trouvé dans la carte du code qui corresponde à cette demande. Nommez un dossier, une classe, une fonction ou une route.',
    noSummary: 'Voici la vue, tirée de la carte du code.',
  },
} as const

export type CodeAnswer = {
  content: string
  /** The new view, to accept like any other change; null when nothing was drawn. */
  change: StoredChange | null
  log: { target: boolean; nodes: number; truncated: boolean }
}

/**
 * Answers a message of the assistant from the project's code map: the owner's model first names
 * the code the request is about, from an outline of the map and the conversation so far, then
 * draws that part of the map as a new view. Names, paths and links only. Nothing is stored here.
 * Throws `LlmCallError` when a call fails.
 */
export async function answerFromCode(input: {
  model: LanguageModel
  /** A ready map of the architecture's project. */
  codeMap: CodeMap & { storageKey: string }
  /** With its diagrams preloaded. */
  architecture: Architecture
  conversation: AssistantConversation
  user: User
  message: string
  locale: keyof typeof WORDS
}): Promise<CodeAnswer> {
  const { model, codeMap, architecture, locale } = input
  const words = WORDS[locale]
  const map = await readDetectedCodeMap(codeMap.storageKey)
  const resolved = await resolveDiagramRequest(model, {
    outline: outlineCodeMap(map, { query: input.message }),
    ...(codeMap.repositoryUrl ? { repository: codeMap.repositoryUrl } : {}),
    views: await projectViews(codeMap.projectId, input.user),
    locale,
    message: input.message,
    history: await conversationHistory(input.conversation),
  })
  const nothing = (reply = '') => ({
    content: reply || words.nothing,
    change: null,
    log: { target: false, nodes: 0, truncated: resolved.truncated },
  })
  if (!('target' in resolved)) return nothing(resolved.reply)
  const source = drawingSource(map, resolved.target, architecture, locale)
  if (!source) return nothing()

  const result = await source.draw(model)
  return {
    content: result.summary || words.noSummary,
    change: proposedChange(result, resolved.target.kind, architecture.diagrams),
    log: { target: true, nodes: source.nodes, truncated: resolved.truncated },
  }
}
