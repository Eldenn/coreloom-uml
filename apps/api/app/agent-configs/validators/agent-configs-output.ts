import type {
  AgentContextFile,
  AgentContextRole,
  AnswerValue,
  Localized,
  Question,
  Recommendation,
  Role,
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

export type AgentRoleOutput = Role & { id: number; createdAt: string; updatedAt: string }

/** A configuration's own fields. */
export type AgentConfigOutput = {
  id: number
  /** null outside any project. */
  projectId: number | null
  name: string
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
  /** What each target does with each role. */
  roles: AgentContextRole[]
}

/** A configured questionnaire answered against an older version than the catalog's. */
export type OutdatedQuestionnaireOutput = { id: string; version: string; currentVersion: string }

/** A diagram with content of the architectures it reads from, which rule proposals can read. */
export type AgentDiagramOutput = {
  id: number
  title: string
  kind: DiagramKind
  /** The title of the architecture it belongs to. */
  architecture: string
}

/** `POST /agent-configs/:id/imports`: nothing is stored. */
export type AgentImportOutput = {
  /** Each fits its question and differs from the current answer. */
  answers: { questionnaireId: string; questionId: string; value: AnswerValue; evidence: string }[]
  rules: { section: string; text: string }[]
  /** The end of the file was cut to fit what the model can read. */
  truncated: boolean
}

/** `GET /agent-configs/:id`: the configuration and everything it is rendered from. */
export type AgentConfigDetailOutput = AgentConfigOutput & {
  /** The sections an accepted rule may go to, in render order. */
  ruleSections: string[]
  answers: AgentAnswerOutput[]
  /** In position order. */
  rules: AgentRuleOutput[]
  /** In id order. */
  roles: AgentRoleOutput[]
  latestGeneration: AgentGenerationSummaryOutput | null
  outdatedQuestionnaires: OutdatedQuestionnaireOutput[]
  /** Its diagrams with content, architecture by architecture. */
  diagrams: AgentDiagramOutput[]
}

/** What regenerating now would change; `null` before the first generation. */
export type AgentConfigImpactOutput = AgentConfigImpact | null

/** Shape returned by `GET /agent-configs`. */
export type AgentConfigsListOutput = Paginated<AgentConfigOutput>

/** Shape returned by `GET /agent-configs/:id/generations`. */
export type AgentGenerationsListOutput = Paginated<AgentGenerationSummaryOutput>
