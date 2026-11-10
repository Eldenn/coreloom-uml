import type {
  AgentContextFile,
  AnswerValue,
  Localized,
  Question,
  Recommendation,
} from '@coreloom-uml/catalog'
import type { AgentRuleSource, Target } from '#app/agent-configs/constants/agent-config'
import type { AgentConfigQuestionnaire } from '#app/agent-configs/models/agent-config'
import type { AgentGenerationSkills } from '#app/agent-configs/models/agent-config-generation'
import type { AgentConfigImpact } from '#app/agent-configs/services/agent-context'
import type { DiagramKind } from '#app/diagrams/constants/diagram'
import type { Paginated } from '#app/shared/pagination/paginate'

/** A catalog questionnaire, as listed by `GET /questionnaires`. */
export type QuestionnaireSummaryOutput = {
  id: string
  version: string
  title: Localized
  description: Localized
  questionCount: number
}

/** A question as the questionnaire screen shows it: without the fragments it renders. */
export type QuestionnaireQuestionOutput = Omit<Question, 'fragments'>

/** `GET /questionnaires/:questionnaireId` */
export type QuestionnaireOutput = QuestionnaireSummaryOutput & {
  /** The sections it adds, in render order. */
  sections: string[]
  /** Labels of the ends of every scale question. */
  scaleLabels: { min: Localized; max: Localized }
  questions: QuestionnaireQuestionOutput[]
}

export type AgentAnswerOutput = {
  questionnaireId: string
  questionId: string
  value: AnswerValue
  details: string | null
  updatedAt: string
}

export type AgentRuleOutput = {
  id: number
  section: string
  text: string
  source: AgentRuleSource
  position: number
  createdAt: string
  updatedAt: string
}

/** A configuration's own fields. */
export type AgentConfigOutput = {
  id: number
  projectId: number
  questionnaires: AgentConfigQuestionnaire[]
  targets: Target[]
  notes: string | null
  revision: number
  createdAt: string
  updatedAt: string
}

/** A generation without its files' content. */
export type AgentGenerationSummaryOutput = {
  id: number
  revision: number
  catalogVersion: string
  paths: string[]
  createdAt: string
}

/** A generation with its files: what the CLI writes into a repository. */
export type AgentGenerationOutput = AgentGenerationSummaryOutput & {
  files: AgentContextFile[]
  recommendations: Recommendation[]
  skills: AgentGenerationSkills
}

/** A configured questionnaire answered against an older version than the catalog's. */
export type OutdatedQuestionnaireOutput = { id: string; version: string; currentVersion: string }

/** A diagram of the project with content, which rule proposals can read. */
export type AgentDiagramOutput = {
  id: number
  title: string
  kind: DiagramKind
  /** The title of the architecture it belongs to. */
  architecture: string
}

/** `GET /projects/:id/agent-config`: the configuration and everything it is rendered from. */
export type AgentConfigDetailOutput = AgentConfigOutput & {
  /** The sections an accepted rule may go to, in render order. */
  ruleSections: string[]
  answers: AgentAnswerOutput[]
  /** In position order. */
  rules: AgentRuleOutput[]
  latestGeneration: AgentGenerationSummaryOutput | null
  outdatedQuestionnaires: OutdatedQuestionnaireOutput[]
  /** The project's diagrams with content, architecture by architecture. */
  diagrams: AgentDiagramOutput[]
}

/** What regenerating now would change; `null` before the first generation. */
export type AgentConfigImpactOutput = AgentConfigImpact | null

/** Shape returned by `GET /projects/:id/agent-config/generations`. */
export type AgentGenerationsListOutput = Paginated<AgentGenerationSummaryOutput>
