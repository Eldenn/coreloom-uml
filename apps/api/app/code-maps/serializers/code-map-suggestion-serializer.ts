import type CodeMap from '#app/code-maps/models/code-map'
import type CodeMapSuggestion from '#app/code-maps/models/code-map-suggestion'
import type {
  CodeMapSuggestionOutput,
  CodeMapSuggestionsOutput,
} from '#app/code-maps/validators/code-maps-output'

export function serializeSuggestion(suggestion: CodeMapSuggestion): CodeMapSuggestionOutput {
  return {
    id: suggestion.id,
    codeMapId: suggestion.codeMapId,
    kind: suggestion.kind,
    title: suggestion.title,
    reason: suggestion.reason,
    focus: suggestion.focus,
    status: suggestion.status,
    architectureId: suggestion.architectureId,
    conversationId: suggestion.conversationId,
  }
}

export function serializeSuggestions(
  codeMap: CodeMap,
  suggestions: readonly CodeMapSuggestion[],
): CodeMapSuggestionsOutput {
  return {
    codeMapId: codeMap.id,
    suggestedAt: codeMap.suggestedAt?.toISO() ?? null,
    suggestions: suggestions.map(serializeSuggestion),
  }
}
