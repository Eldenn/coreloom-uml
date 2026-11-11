import {
  type AgentContextFile,
  type AgentContextOutput,
  type AgentContextProject,
  CATALOG_VERSION,
  findQuestionnaire,
  MANAGED_BLOCK_BEGIN,
  MANAGED_BLOCK_END,
  matchSkills,
  migrateAnswers,
  type PackageDiagramShape,
  type Questionnaire,
  renderAgentContext,
  Section,
  type Skill,
  type SkillSuggestions,
  type StoredAnswer,
  sectionOrder,
} from '@coreloom-uml/catalog'
import type { PackageDiagram } from '@coreloom-uml/uml'
import type { Target } from '#app/agent-configs/constants/agent-config'
import type AgentConfig from '#app/agent-configs/models/agent-config'
import type { AgentConfigQuestionnaire } from '#app/agent-configs/models/agent-config'
import type AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import { whereConfigArchitecture } from '#app/agent-configs/services/agent-config-diagrams'
import Architecture from '#app/architectures/models/architecture'
import Project from '#app/projects/models/project'

/**
 * Everything a configuration's files are rendered from, as stored on each generation: replaying
 * it with the current catalog tells what changed since.
 */
export type AgentConfigInputs = {
  project: AgentContextProject
  questionnaires: AgentConfigQuestionnaire[]
  answers: StoredAnswer[]
  /** In position order. */
  rules: { section: string; text: string }[]
  notes: string | null
  targets: Target[]
}

export const FileChange = {
  Modified: 'modified',
  Added: 'added',
  Removed: 'removed',
} as const
export type FileChange = (typeof FileChange)[keyof typeof FileChange]

/** What regenerating now would change compared with the latest generation. */
export type AgentConfigImpact = {
  /** The source, the catalog or the project changed since the latest generation. */
  stale: boolean
  /** `questionnaireId/questionId` of the answers whose fragments differ. */
  changedQuestions: string[]
  files: { path: string; sections: string[]; change: FileChange }[]
}

/** The questionnaires of the catalog a configuration names, at their current version. */
export function resolveQuestionnaires(
  questionnaires: readonly AgentConfigQuestionnaire[],
): Questionnaire[] {
  return questionnaires
    .map((item) => findQuestionnaire(item.id))
    .filter((item): item is Questionnaire => item !== undefined)
}

/** Configured questionnaires answered against an older version than the catalog's. */
export function outdatedQuestionnaires(config: AgentConfig) {
  return config.questionnaires.flatMap((item) => {
    const current = findQuestionnaire(item.id)
    return current && current.version !== item.version
      ? [{ id: item.id, version: item.version, currentVersion: current.version }]
      : []
  })
}

function packageShape(diagram: PackageDiagram): PackageDiagramShape {
  return {
    elements: diagram.elements.map(({ id, kind, label, parent }) => ({
      id,
      kind,
      ...(label === undefined ? {} : { label }),
      ...(parent === undefined ? {} : { parent }),
    })),
    relations: diagram.relations.map(({ from, to }) => ({ from, to })),
  }
}

/**
 * What the `Project` section shows: the project's name and description (the configuration's
 * name outside any project), then the architectures it reads from with the kind and title of
 * their diagrams. Of their content, only what a package diagram draws (its elements and the
 * arrows between them), which the dependency rules are rendered from.
 */
export async function projectContext(config: AgentConfig): Promise<AgentContextProject> {
  const project = config.projectId === null ? null : await Project.findOrFail(config.projectId)
  const architectures = await whereConfigArchitecture(Architecture.query(), config)
    .orderBy('createdAt', 'asc')
    .orderBy('id', 'asc')
    .preload('diagrams', (query) => query.orderBy('position', 'asc').orderBy('id', 'asc'))
  return {
    name: project?.name ?? config.name,
    description: project?.description ?? null,
    architectures: architectures.map((architecture) => ({
      title: architecture.title,
      description: architecture.description,
      diagrams: architecture.diagrams.map((diagram) => ({
        kind: diagram.kind,
        title: diagram.title,
        ...(diagram.content?.kind === 'package' ? { packages: packageShape(diagram.content) } : {}),
      })),
    })),
  }
}

/** The configuration's current state, ready to render or to store on a generation. */
export async function currentInputs(config: AgentConfig): Promise<AgentConfigInputs> {
  await config.load('answers', (query) => query.orderBy('id', 'asc'))
  await config.load('rules', (query) => query.orderBy('position', 'asc').orderBy('id', 'asc'))
  const configured = new Set(config.questionnaires.map((item) => item.id))
  return {
    project: await projectContext(config),
    questionnaires: config.questionnaires.map(({ id, version }) => ({ id, version })),
    answers: config.answers
      .filter((answer) => configured.has(answer.questionnaireId))
      .map(({ questionnaireId, questionId, value }) => ({ questionnaireId, questionId, value })),
    rules: config.rules.map(({ section, text }) => ({ section, text })),
    notes: config.notes,
    targets: [...config.targets],
  }
}

/** The questionnaires of the inputs at their current version, and the answers migrated to it. */
function resolveInputs(inputs: AgentConfigInputs) {
  const questionnaires = resolveQuestionnaires(inputs.questionnaires)
  let answers: StoredAnswer[] = inputs.answers
  for (const questionnaire of questionnaires) answers = migrateAnswers(questionnaire, answers)
  return { questionnaires, answers }
}

/**
 * Renders inputs with the current catalog: questionnaires are taken at their current version
 * and the answers go through its migrations first, so an older snapshot replays like a new one.
 */
export function render(inputs: AgentConfigInputs): AgentContextOutput {
  const { questionnaires, answers } = resolveInputs(inputs)
  return renderAgentContext({
    project: inputs.project,
    questionnaires,
    answers,
    rules: inputs.rules,
    notes: inputs.notes,
    targets: inputs.targets,
  })
}

/**
 * The catalog's skills that fit the inputs (answers read like `render` reads them, and the kinds
 * of the project's diagrams).
 */
export function suggestSkills(
  inputs: AgentConfigInputs,
  skills: readonly Skill[],
): SkillSuggestions {
  const { questionnaires, answers } = resolveInputs(inputs)
  const diagramKinds = inputs.project.architectures.flatMap((architecture) =>
    architecture.diagrams.map((diagram) => diagram.kind),
  )
  return matchSkills({ questionnaires, answers, targets: inputs.targets, diagramKinds }, skills)
}

/**
 * Compares the current state with the latest generation by rendering both with the current
 * catalog. `null` when nothing was generated yet.
 */
export function computeImpact(
  config: AgentConfig,
  inputs: AgentConfigInputs,
  latest: AgentConfigGeneration | null,
): AgentConfigImpact | null {
  if (!latest) return null
  const before = render(latest.inputs)
  const after = render(inputs)

  const sections = [
    ...new Set([
      ...sectionOrder(resolveQuestionnaires(latest.inputs.questionnaires)),
      ...sectionOrder(resolveQuestionnaires(inputs.questionnaires)),
    ]),
  ]
  const files = compareFiles(before.files, after.files, sections)

  return {
    stale:
      config.revision > latest.revision ||
      latest.catalogVersion !== CATALOG_VERSION ||
      files.length > 0,
    changedQuestions: changedQuestions(before, after),
    files,
  }
}

function changedQuestions(before: AgentContextOutput, after: AgentContextOutput): string[] {
  const group = (output: AgentContextOutput) => {
    const texts = new Map<string, string[]>()
    for (const fragment of output.fragments) {
      const key = `${fragment.questionnaireId}/${fragment.questionId}`
      texts.set(key, [...(texts.get(key) ?? []), fragment.text])
    }
    return texts
  }
  const old = group(before)
  const now = group(after)
  const keys = [...new Set([...old.keys(), ...now.keys()])]
  return keys.filter((key) => (old.get(key) ?? []).join('\n') !== (now.get(key) ?? []).join('\n'))
}

function compareFiles(
  before: AgentContextFile[],
  after: AgentContextFile[],
  sections: string[],
): AgentConfigImpact['files'] {
  const changes: AgentConfigImpact['files'] = []
  for (const file of after) {
    const old = before.find((item) => item.path === file.path)
    if (!old) {
      changes.push({ path: file.path, sections: [], change: FileChange.Added })
    } else if (old.content !== file.content) {
      changes.push({
        path: file.path,
        sections: changedSections(old.content, file.content, sections),
        change: FileChange.Modified,
      })
    }
  }
  for (const file of before) {
    if (!after.some((item) => item.path === file.path)) {
      changes.push({ path: file.path, sections: [], change: FileChange.Removed })
    }
  }
  return changes
}

/** The sections, in render order, whose body differs between two renders of a file. */
function changedSections(before: string, after: string, sections: string[]): string[] {
  const old = splitSections(before, sections)
  const now = splitSections(after, sections)
  return sections.filter((section) => old.get(section) !== now.get(section))
}

/**
 * Cuts a rendered block into its `## <section>` parts. Only known section headings count, and
 * nothing after `Project notes` (the owner's Markdown, which may hold headings of its own).
 */
function splitSections(content: string, sections: string[]): Map<string, string> {
  const parts = new Map<string, string>()
  let current: string | null = null
  for (const line of content.split('\n')) {
    if (line === MANAGED_BLOCK_BEGIN || line === MANAGED_BLOCK_END) continue
    const heading = line.startsWith('## ') ? line.slice(3) : null
    if (
      heading !== null &&
      current !== Section.ProjectNotes &&
      sections.includes(heading) &&
      !parts.has(heading)
    ) {
      current = heading
      parts.set(current, '')
      continue
    }
    if (current !== null) parts.set(current, `${parts.get(current)}${line}\n`)
  }
  return parts
}
