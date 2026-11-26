import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { outlineCodeMap } from '@coreloom-uml/codemap'
import { LlmCallError, type SuggestionsResult, suggestDiagrams } from '@coreloom-uml/llm'
import { DateTime } from 'luxon'
import {
  CODE_MAP_SUGGESTION_LIMITS,
  CodeMapStatus,
  CodeMapSuggestionStatus,
} from '#app/code-maps/constants/code-map'
import type CodeMap from '#app/code-maps/models/code-map'
import CodeMapSuggestion from '#app/code-maps/models/code-map-suggestion'
import {
  serializeSuggestion,
  serializeSuggestions,
} from '#app/code-maps/serializers/code-map-suggestion-serializer'
import { readDetectedCodeMap } from '#app/code-maps/services/code-map-storage'
import { CODE_MAPS_NOT_FOUND, codeMapsEnabled } from '#app/code-maps/services/code-maps-flag'
import { projectViews } from '#app/code-maps/services/drawing-source'
import { CODE_MAP_NOT_FOUND, findOwnedCodeMap } from '#app/code-maps/services/owned-code-map'
import { findOwnedSuggestion, SUGGESTION_NOT_FOUND } from '#app/code-maps/services/owned-suggestion'
import {
  suggestDiagramsInput,
  updateSuggestionInput,
} from '#app/code-maps/validators/code-maps-input'
import { llmFailure, userLanguageModel } from '#app/llm/services/language-models'
import { SUBSCRIPTION_NOT_FOUND } from '#app/llm-connections/constants/llm-connections'

const NOT_READY = { error: { message: 'This code map is not ready' } } as const

function listOf(codeMap: CodeMap) {
  return CodeMapSuggestion.query()
    .where('codeMapId', codeMap.id)
    .orderBy('position', 'asc')
    .orderBy('id', 'asc')
}

/**
 * The diagrams worth drawing for a code map, proposed by the owner's own model from an outline of
 * the map (folders, imports, the most linked classes, where processes start; never source code).
 * The browser asks once when a ready map is first shown, and again when the owner asks. Each
 * proposal is then drawn on request (`CodeMapSuggestionDraftsController`) or set aside.
 * Session only, behind `code-maps`.
 */
export default class CodeMapSuggestionsController {
  /** `GET /code-maps/:id/suggestions` */
  async index({ params, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const codeMap = await findOwnedCodeMap(params.id, user)
    if (!codeMap) return response.notFound(CODE_MAP_NOT_FOUND)
    return response.ok(serializeSuggestions(codeMap, await listOf(codeMap)))
  }

  /**
   * `POST /code-maps/:id/suggestions`: a new list replaces the proposals not drawn yet; the drawn
   * ones stay, and the model is told about the views they made through the project's titles.
   */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const codeMap = await findOwnedCodeMap(params.id, user)
    if (!codeMap) return response.notFound(CODE_MAP_NOT_FOUND)
    if (codeMap.status !== CodeMapStatus.Ready || !codeMap.storageKey) {
      return response.conflict(NOT_READY)
    }
    const { provider, locale } = await request.validateUsing(suggestDiagramsInput)

    const built = await userLanguageModel(provider, user)
    if ('problem' in built)
      return response.unprocessableEntity({ error: { message: built.problem } })
    if ('notFound' in built) return response.notFound(SUBSCRIPTION_NOT_FOUND)
    const log = { codeMapId: codeMap.id, kind: provider.kind, model: provider.model }
    if ('reason' in built) {
      logger.warn({ ...log, reason: built.reason }, 'diagram suggestions failed')
      return response.badGateway(llmFailure(built.reason))
    }

    const map = await readDetectedCodeMap(codeMap.storageKey)
    const outline = outlineCodeMap(map)
    const views = await projectViews(codeMap.projectId, user)
    const started = performance.now()
    let result: SuggestionsResult
    try {
      result = await suggestDiagrams(built.model, {
        outline,
        ...(codeMap.repositoryUrl ? { repository: codeMap.repositoryUrl } : {}),
        views,
        locale,
      })
    } catch (error) {
      if (!(error instanceof LlmCallError)) throw error
      const durationMs = Math.round(performance.now() - started)
      logger.warn({ ...log, durationMs, reason: error.reason }, 'diagram suggestions failed')
      return response.badGateway(llmFailure(error.reason))
    }
    logger.info(
      {
        ...log,
        durationMs: Math.round(performance.now() - started),
        suggestions: result.suggestions.length,
        dropped: result.dropped,
        truncated: result.truncated,
        entries: outline.counts.entries,
        starts: outline.starts.length,
      },
      'diagram suggestions',
    )

    await db.transaction(async (trx) => {
      await CodeMapSuggestion.query({ client: trx })
        .where('codeMapId', codeMap.id)
        .whereNot('status', CodeMapSuggestionStatus.Drafted)
        .delete()
      const last = await CodeMapSuggestion.query({ client: trx })
        .where('codeMapId', codeMap.id)
        .max('position as position')
        .first()
      const offset = Number(last?.$extras.position ?? -1) + 1
      await CodeMapSuggestion.createMany(
        result.suggestions.map((suggestion, index) => ({
          codeMapId: codeMap.id,
          kind: suggestion.kind,
          title: suggestion.title.slice(0, CODE_MAP_SUGGESTION_LIMITS.title),
          reason: suggestion.reason,
          focus: suggestion.focus.slice(0, CODE_MAP_SUGGESTION_LIMITS.focus),
          status: CodeMapSuggestionStatus.Open,
          position: offset + index,
        })),
        { client: trx },
      )
      codeMap.useTransaction(trx)
      codeMap.suggestedAt = DateTime.now()
      await codeMap.save()
    })
    return response.created(serializeSuggestions(codeMap, await listOf(codeMap)))
  }

  /** `PATCH /code-map-suggestions/:id`: set a proposal aside, or bring it back. */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    if (!(await codeMapsEnabled(user))) return response.notFound(CODE_MAPS_NOT_FOUND)
    const suggestion = await findOwnedSuggestion(params.id, user)
    if (!suggestion) return response.notFound(SUGGESTION_NOT_FOUND)
    const { status } = await request.validateUsing(updateSuggestionInput)
    if (suggestion.status === CodeMapSuggestionStatus.Drafted) {
      return response.conflict({ error: { message: 'This proposal was already drawn' } })
    }
    suggestion.status = status
    await suggestion.save()
    return response.ok(serializeSuggestion(suggestion))
  }
}
