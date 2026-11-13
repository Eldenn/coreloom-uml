import { type Questionnaire, ruleSections, SCALE_LABELS } from '@coreloom-uml/catalog'
import type AgentConfig from '#app/agent-configs/models/agent-config'
import type AgentConfigAnswer from '#app/agent-configs/models/agent-config-answer'
import type AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import type AgentConfigRole from '#app/agent-configs/models/agent-config-role'
import type AgentConfigRule from '#app/agent-configs/models/agent-config-rule'
import {
  outdatedQuestionnaires,
  resolveQuestionnaires,
} from '#app/agent-configs/services/agent-context'
import type {
  AgentAnswerOutput,
  AgentConfigDetailOutput,
  AgentConfigOutput,
  AgentGenerationOutput,
  AgentGenerationSummaryOutput,
  AgentRoleOutput,
  AgentRuleOutput,
  QuestionnaireOutput,
  QuestionnaireSummaryOutput,
} from '#app/agent-configs/validators/agent-configs-output'

export function serializeQuestionnaireSummary(
  questionnaire: Questionnaire,
): QuestionnaireSummaryOutput {
  return {
    id: questionnaire.id,
    version: questionnaire.version,
    title: questionnaire.title,
    description: questionnaire.description,
    questionCount: questionnaire.questions.length,
  }
}

export function serializeQuestionnaire(questionnaire: Questionnaire): QuestionnaireOutput {
  return {
    ...serializeQuestionnaireSummary(questionnaire),
    sections: [...questionnaire.sections],
    scaleLabels: SCALE_LABELS,
    questions: questionnaire.questions.map(({ fragments: _fragments, ...question }) => question),
  }
}

export function serializeAgentConfig(config: AgentConfig): AgentConfigOutput {
  return {
    id: config.id,
    projectId: config.projectId,
    name: config.name,
    questionnaires: config.questionnaires,
    targets: config.targets,
    notes: config.notes,
    revision: config.revision,
    createdAt: config.createdAt.toISO() ?? '',
    updatedAt: config.updatedAt.toISO() ?? '',
  }
}

export function serializeAgentAnswer(answer: AgentConfigAnswer): AgentAnswerOutput {
  return {
    questionnaireId: answer.questionnaireId,
    questionId: answer.questionId,
    value: answer.value,
    details: answer.details,
    updatedAt: answer.updatedAt.toISO() ?? '',
  }
}

export function serializeAgentRule(rule: AgentConfigRule): AgentRuleOutput {
  return {
    id: rule.id,
    section: rule.section,
    text: rule.text,
    source: rule.source,
    position: rule.position,
    createdAt: rule.createdAt.toISO() ?? '',
    updatedAt: rule.updatedAt.toISO() ?? '',
  }
}

export function serializeAgentRole(role: AgentConfigRole): AgentRoleOutput {
  return {
    id: role.id,
    ...role.toRole(),
    createdAt: role.createdAt.toISO() ?? '',
    updatedAt: role.updatedAt.toISO() ?? '',
  }
}

export function serializeAgentGenerationSummary(
  generation: AgentConfigGeneration,
): AgentGenerationSummaryOutput {
  return {
    id: generation.id,
    revision: generation.revision,
    catalogVersion: generation.catalogVersion,
    paths: generation.files.map((file) => file.path),
    createdAt: generation.createdAt.toISO() ?? '',
  }
}

export function serializeAgentGeneration(generation: AgentConfigGeneration): AgentGenerationOutput {
  return {
    ...serializeAgentGenerationSummary(generation),
    files: generation.files,
    recommendations: generation.recommendations,
    skills: generation.skills,
    roles: generation.roles,
  }
}

/**
 * Expects `answers`, `rules` and `roles` preloaded (`currentInputs` loads them), rules in
 * position order, roles in id order.
 */
export function serializeAgentConfigDetail(
  config: AgentConfig,
  latest: AgentConfigGeneration | null,
  diagrams: AgentConfigDetailOutput['diagrams'],
): AgentConfigDetailOutput {
  const configured = new Set(config.questionnaires.map((item) => item.id))
  return {
    ...serializeAgentConfig(config),
    ruleSections: ruleSections(resolveQuestionnaires(config.questionnaires)),
    answers: config.answers
      .filter((answer) => configured.has(answer.questionnaireId))
      .map(serializeAgentAnswer),
    rules: config.rules.map(serializeAgentRule),
    roles: config.roles.map(serializeAgentRole),
    latestGeneration: latest ? serializeAgentGenerationSummary(latest) : null,
    outdatedQuestionnaires: outdatedQuestionnaires(config),
    diagrams,
  }
}
