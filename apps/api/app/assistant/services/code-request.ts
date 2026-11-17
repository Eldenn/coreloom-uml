import { outlineCodeMap } from '@coreloom-uml/codemap'
import { type LanguageModel, resolveDiagramRequest } from '@coreloom-uml/llm'
import type Architecture from '#app/architectures/models/architecture'
import type { StoredChange } from '#app/assistant/constants/assistant'
import type AssistantConversation from '#app/assistant/models/assistant-conversation'
import { conversationHistory } from '#app/assistant/services/assistant-context'
import type CodeMap from '#app/code-maps/models/code-map'
import { readDetectedCodeMap } from '#app/code-maps/services/code-map-storage'
import { readSource, withSourceSentence } from '#app/code-maps/services/code-source'
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

/** Earlier requests of the conversation whose words may still name the code asked about. */
const EARLIER_REQUESTS = 2

export type CodeAnswer = {
  content: string
  /** The new view, to accept like any other change; null when nothing was drawn. */
  change: StoredChange | null
  log: { target: boolean; nodes: number; truncated: boolean }
}

/**
 * Answers a message of the assistant from the project's code map: the owner's model first names
 * the code the request is about, from an outline of the map and the conversation so far, then
 * draws that part of the map as a new view, with the source of its files when the repository can
 * be read on GitHub (`readSource`). Nothing is stored here.
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
  const history = await conversationHistory(input.conversation)
  // A follow-up ("the same as an activity diagram") names nothing: the requests before it do.
  const earlier = history
    .filter((turn) => turn.role === 'user')
    .map((turn) => turn.text)
    .reverse()
    .slice(0, EARLIER_REQUESTS)
  const resolved = await resolveDiagramRequest(model, {
    outline: outlineCodeMap(map, { query: input.message, earlier }),
    ...(codeMap.repositoryUrl ? { repository: codeMap.repositoryUrl } : {}),
    views: await projectViews(codeMap.projectId, input.user),
    locale,
    message: input.message,
    history,
  })
  const nothing = (reply = '') => ({
    content: reply || words.nothing,
    change: null,
    log: { target: false, nodes: 0, truncated: resolved.truncated },
  })
  if (!('target' in resolved)) return nothing(resolved.reply)
  const source = drawingSource(map, resolved.target, architecture, locale)
  if (!source) return nothing()

  const reading = await readSource(codeMap, input.user, source.sourceNodes)
  const result = await source.draw(model, reading?.excerpts)
  return {
    content: withSourceSentence(result.summary || words.noSummary, reading, locale),
    change: proposedChange(result, resolved.target.kind, architecture.diagrams),
    log: { target: true, nodes: source.nodes, truncated: resolved.truncated },
  }
}
