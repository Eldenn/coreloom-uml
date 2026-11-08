import type { HttpContext } from '@adonisjs/core/http'
import { findQuestionnaire, QUESTIONNAIRES } from '@coreloom-uml/catalog'
import {
  serializeQuestionnaire,
  serializeQuestionnaireSummary,
} from '#app/agent-configs/serializers/agent-config-serializer'

const QUESTIONNAIRE_NOT_FOUND = { error: { message: 'Questionnaire not found' } } as const

/** The catalog's questionnaires, at the server's version: the web app never imports them. */
export default class QuestionnairesController {
  async index({ response }: HttpContext) {
    return response.ok({ questionnaires: QUESTIONNAIRES.map(serializeQuestionnaireSummary) })
  }

  async show({ params, response }: HttpContext) {
    const questionnaire = findQuestionnaire(String(params.questionnaireId))
    if (!questionnaire) return response.notFound(QUESTIONNAIRE_NOT_FOUND)
    return response.ok({ questionnaire: serializeQuestionnaire(questionnaire) })
  }
}
