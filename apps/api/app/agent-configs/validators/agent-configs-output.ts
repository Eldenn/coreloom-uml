import type {
  AgentContextFile,
  AgentContextRole,
  Localized,
  Recommendation,
  Role,
  RoleSuggestion,
  RulePick,
} from '@coreloom-uml/catalog'
import type { AgentRuleSource, Target } from '#app/agent-configs/constants/agent-config'
import type { AgentGenerationSkills } from '#app/agent-configs/models/agent-config-generation'
import type { AgentConfigImpact } from '#app/agent-configs/services/agent-context'
import type { MessageOutput } from '#app/assistant/validators/assistant-output'
import type { DiagramKind } from '#app/diagrams/constants/diagram'
import type { ResearchStep } from '#app/research/services/research-progress'
import type { Paginated } from '#app/shared/pagination/paginate'

/** A ready-made rule of the catalog, as the screen shows it. */
export type ReadyRuleOutput = {
  /** Unique in its group. */
  id: string
  /** Its name: its label, or its first line. */
  title: Localized
  /** The lines it writes in its group's section; `{value}` stands for the typed text or its id. */
  lines: string[]
  /** Accepted with a text typed by the owner. */
  input: boolean
  /** Cannot be held together with another rule of its group. */
  alone: boolean
  /** Accepting it also changes a generated file besides AGENTS.md (settings, hook, workflow…). */
  applied: boolean
}

/** The ready-made rules about one aspect of the work, identified by its slot. */
export type RuleGroupOutput = {
  slot: string
  section: string
  label: Localized
  help: Localized | null
  /** How many of its rules a configuration may hold. */
  pick: RulePick
  /** Written once, after the accepted rules' own lines. */
  lines: string[]
  rules: ReadyRuleOutput[]
}

/** A rule pack of the catalog, as listed by `GET /rule-packs`. */
export type RulePackOutput = {
  id: string
  title: Localized
  description: Localized
  /** The sections it adds, in render order. */
  sections: string[]
  groups: RuleGroupOutput[]
}

/** A ready-made rule a configuration holds. */
export type AgentReadyRuleOutput = { slot: string; rule: string; value: string | null }

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

/** A ready-made role, without its mission. */
/** `GET /agent-configs/:id/roles/suggestions` (`suggestRoles`). */
export type RoleSuggestionsOutput = { suggestions: RoleSuggestion[] }

export type RolePresetOutput = {
  slug: string
  name: string
  description: string
  readOnly: boolean
  source: { repository: string; commit: string }
}

/** A skill a configuration holds. */
export type AgentHeldSkillOutput = {
  slug: string
  name: string
  description: { en: string; fr?: string }
  url: string
}

/** A configuration's own fields. */
export type AgentConfigOutput = {
  id: number
  /** null outside any project. */
  projectId: number | null
  name: string
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
  skills: AgentGenerationSkills & { held: string[] }
  /** The tools it was rendered for: where `pull` installs the held skills. */
  targets: Target[]
  /** What each target does with each role. */
  roles: AgentContextRole[]
}

/** A diagram with content of the architectures it reads from, which rule proposals can read. */
export type AgentDiagramOutput = {
  id: number
  title: string
  kind: DiagramKind
  /** The title of the architecture it belongs to. */
  architecture: string
}

/**
 * `POST /agent-configs/:id/imports`: nothing is stored, unless `conversation` was given: the
 * exchange is then stored in that assistant conversation and answered as `messages`.
 */
export type AgentImportOutput = {
  /** Ready-made rules to accept: each fits its group and is not held yet. */
  ready: (AgentReadyRuleOutput & { evidence: string })[]
  rules: { section: string; text: string }[]
  /** The end of the file was cut to fit what the model can read. */
  truncated: boolean
  /** Only with `conversation`: the request and the answer holding the proposals, as stored. */
  messages?: MessageOutput[]
}

/** `POST /agent-configs/:id/research`: nothing is stored. */
export type AgentResearchOutput = {
  /** What the model found, to hand to `POST …/imports` with `origin: 'research'`. */
  findings: string
  /** The pages the sandbox actually read, in order. */
  sources: { url: string; title: string | null }[]
}

/** `GET /agent-configs/:id/research`: the running research's steps, none when no research runs. */
export type AgentResearchProgressOutput = { steps: ResearchStep[] }

/** `GET /agent-configs/:id`: the configuration and everything it is rendered from. */
export type AgentConfigDetailOutput = AgentConfigOutput & {
  /** The sections one of the owner's own rules may go to, in render order. */
  ruleSections: string[]
  /** The ready-made rules it holds, in catalog order. */
  readyRules: AgentReadyRuleOutput[]
  /** In position order. */
  rules: AgentRuleOutput[]
  /** In id order. */
  roles: AgentRoleOutput[]
  /** The skills it holds (`pull` installs them), by name. */
  skills: AgentHeldSkillOutput[]
  latestGeneration: AgentGenerationSummaryOutput | null
  /** Its diagrams with content, architecture by architecture. */
  diagrams: AgentDiagramOutput[]
}

/**
 * `POST /agent-configs/merge` while a conflict has no choice: what the sources cannot hold
 * together, each with the sources to choose from (sources holding the same thing are listed once).
 */
export type AgentMergeConflictsOutput = {
  /** A group whose rules cannot all be held: one source's rules are kept. */
  readyRules: {
    slot: string
    options: { sourceId: number; rules: { rule: string; value: string | null }[] }[]
  }[]
  /** Different roles with one slug: one source's role is kept. */
  roles: { slug: string; options: { sourceId: number; name: string; description: string }[] }[]
}

/** What regenerating now would change; `null` before the first generation. */
export type AgentConfigImpactOutput = AgentConfigImpact | null

/** Shape returned by `GET /agent-configs`. */
export type AgentConfigsListOutput = Paginated<AgentConfigOutput>

/** Shape returned by `GET /agent-configs/:id/generations`. */
export type AgentGenerationsListOutput = Paginated<AgentGenerationSummaryOutput>
