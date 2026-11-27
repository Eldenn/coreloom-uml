import {
  type AcceptedRule,
  type AgentContextFile,
  type AgentContextOutput,
  type AgentContextProject,
  CATALOG_VERSION,
  type ComputedAffinities,
  heldTopics,
  MANAGED_BLOCK_BEGIN,
  MANAGED_BLOCK_END,
  matchSkills,
  type PackageDiagramShape,
  type Role,
  type RoleSuggestion,
  RULE_PACKS,
  renderAgentContext,
  repositoryChecks,
  Section,
  type Skill,
  type SkillSuggestions,
  sectionOrder,
  suggestRoles,
} from '@coreloom-uml/catalog'
import type { PackageDiagram } from '@coreloom-uml/uml'
import type { Target } from '#app/agent-configs/constants/agent-config'
import type AgentConfig from '#app/agent-configs/models/agent-config'
import type AgentConfigGeneration from '#app/agent-configs/models/agent-config-generation'
import { heldReadyRules } from '#app/agent-configs/serializers/agent-config-serializer'
import { whereConfigArchitecture } from '#app/agent-configs/services/agent-config-diagrams'
import Architecture from '#app/architectures/models/architecture'
import { agentContextDesign } from '#app/decisions/services/project-design'
import Project from '#app/projects/models/project'

/** Everything a configuration's files are rendered from. */
export type AgentConfigInputs = {
  project: AgentContextProject
  /** The ready-made rules held, in catalog order. */
  ready: AcceptedRule[]
  /** The owner's own rules, in position order. */
  rules: { section: string; text: string }[]
  notes: string | null
  targets: Target[]
  /** In id order; generations stored before roles hold none. */
  roles?: Role[]
}

/**
 * The inputs as a generation stores them, so its render can be replayed with the current
 * catalog to tell what changed since. A generation stored before ready-made rules holds none
 * (it held questionnaires and answers, which are no longer read): it replays without them.
 */
export type StoredAgentConfigInputs = Omit<AgentConfigInputs, 'ready'> & { ready?: AcceptedRule[] }

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
  /** The slots of the groups whose ready-made rules write different lines. */
  changedSlots: string[]
  files: { path: string; sections: string[]; change: FileChange }[]
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
 * arrows between them), which the dependency rules are rendered from. Then, for a project
 * that records them, its requirements and its accepted decisions (`agentContextDesign`).
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
    ...(project && (await agentContextDesign(project.id, config.userId))),
  }
}

/** The configuration's current state, ready to render or to store on a generation. */
export async function currentInputs(config: AgentConfig): Promise<AgentConfigInputs> {
  await config.load('readyRules', (query) => query.orderBy('id', 'asc'))
  await config.load('rules', (query) => query.orderBy('position', 'asc').orderBy('id', 'asc'))
  await config.load('roles', (query) => query.orderBy('id', 'asc'))
  return {
    project: await projectContext(config),
    ready: heldReadyRules(config.readyRules),
    rules: config.rules.map(({ section, text }) => ({ section, text })),
    notes: config.notes,
    targets: [...config.targets],
    roles: config.roles.map((role) => role.toRole()),
  }
}

/** The repository's checks as the inputs' ready-made rules state them. */
export function inputsChecks(inputs: Pick<StoredAgentConfigInputs, 'ready'>) {
  return repositoryChecks({ packs: RULE_PACKS, ready: inputs.ready ?? [] })
}

/** Renders inputs with the current catalog, every rule pack of it. */
export function render(inputs: StoredAgentConfigInputs): AgentContextOutput {
  return renderAgentContext({
    project: inputs.project,
    packs: RULE_PACKS,
    ready: inputs.ready ?? [],
    rules: inputs.rules,
    notes: inputs.notes,
    targets: inputs.targets,
    roles: inputs.roles ?? [],
  })
}

/** The skills that fit the inputs: their ready-made rules and the kinds of the project's diagrams. */
/** The skills that fit the rules held; with `computed`, from computed affinities too (`matchSkills`). */
export function suggestSkills(
  inputs: StoredAgentConfigInputs,
  skills: readonly Skill[],
  computed?: ComputedAffinities,
): SkillSuggestions {
  const diagramKinds = inputs.project.architectures.flatMap((architecture) =>
    architecture.diagrams.map((diagram) => diagram.kind),
  )
  return matchSkills(
    {
      packs: RULE_PACKS,
      ready: inputs.ready ?? [],
      targets: inputs.targets,
      diagramKinds,
      ...(computed ? { computed } : {}),
    },
    skills,
  )
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
  const files = compareFiles(before.files, after.files, sectionOrder(RULE_PACKS))

  return {
    stale:
      config.revision > latest.revision ||
      latest.catalogVersion !== CATALOG_VERSION ||
      files.length > 0,
    changedSlots: changedSlots(before, after),
    files,
  }
}

function changedSlots(before: AgentContextOutput, after: AgentContextOutput): string[] {
  const group = (output: AgentContextOutput) => {
    const texts = new Map<string, string[]>()
    for (const fragment of output.fragments) {
      texts.set(fragment.slot, [...(texts.get(fragment.slot) ?? []), fragment.text])
    }
    return texts
  }
  const old = group(before)
  const now = group(after)
  const slots = [...new Set([...old.keys(), ...now.keys()])]
  return slots.filter(
    (slot) => (old.get(slot) ?? []).join('\n') !== (now.get(slot) ?? []).join('\n'),
  )
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

/** The ready-made roles that share tags with the rules a configuration holds, with their skills. */
export async function suggestConfigRoles(
  config: AgentConfig,
  skills: readonly Skill[],
): Promise<RoleSuggestion[]> {
  await config.load('readyRules')
  const ready = heldReadyRules(config.readyRules)
  return suggestRoles(heldTopics({ packs: RULE_PACKS, ready }), skills, config.targets)
}
