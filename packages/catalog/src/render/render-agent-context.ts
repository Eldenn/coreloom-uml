import { answerProblem, fragmentTexts } from '../answers.ts'
import { roleMatrix } from '../roles/matrix.ts'
import { type Right, type RightStatus, type Role, roleSchema } from '../roles/role.ts'
import type { AnswerValue, Questionnaire } from '../schemas.ts'
import { Section, sectionOrder } from '../sections.ts'
import type { Slot } from '../slots.ts'
import { PACKAGE_MANAGERS, splitCommands } from '../targets/commands.ts'
import { TARGET_TEMPLATES } from '../targets/index.ts'
import type { Recommendation, TargetContext } from '../targets/types.ts'
import { AGENTS_FILE, AgentFileKind, TARGETS, Target } from '../targets.ts'
import {
  DEPENDENCY_CRUISER_FILE,
  type PackageDiagramShape,
  renderDependencyCruiser,
} from './architecture-boundaries.ts'
import { type GatesInput, renderGates } from './gates.ts'
import { hashManagedBlock, wrapManagedBlock } from './managed-block.ts'
import { blockMarkdown, inlineMarkdown, stripMarkers } from './markdown.ts'
import { renderSandbox } from './sandbox.ts'

export type AgentContextProject = {
  name: string
  description: string | null
  architectures: {
    title: string
    description: string | null
    /** `packages`: what a package diagram draws, from which dependency rules are rendered. */
    diagrams: { kind: string; title: string; packages?: PackageDiagramShape }[]
  }[]
}

export type AgentContextInput = {
  project: AgentContextProject
  /** Resolved from the catalog, in the configuration's order. */
  questionnaires: readonly Questionnaire[]
  answers: readonly { questionnaireId: string; questionId: string; value: AnswerValue }[]
  /** Accepted rules, in position order. */
  rules: readonly { section: string; text: string }[]
  notes: string | null
  targets: readonly Target[]
  /**
   * In the order they are rendered in; a role that does not fit `roleSchema` is left out, and so
   * is one whose slug an earlier role has.
   */
  roles: readonly Role[]
}

export type AgentContextFile = {
  path: string
  kind: AgentFileKind
  /**
   * The managed block, followed by one line break. For a JSON settings file, the JSON object
   * whose entries are merged into the file instead. For a role, the whole file, which is managed
   * from its first line to its last.
   */
  content: string
  /** `sha256:<hex>` of the content without its trailing line break. */
  blockHash: string
}

export type AgentContextFragment = {
  questionnaireId: string
  questionId: string
  section: string
  text: string
}

/** What one tool does with one role: how to start it, and what becomes of each right. */
export type AgentContextRole = {
  slug: string
  target: Target
  /** The command that starts the tool as this role; `null` when the tool has none. */
  launch: string | null
  matrix: Record<Right, RightStatus>
}

export type AgentContextOutput = {
  files: AgentContextFile[]
  recommendations: Recommendation[]
  /** One entry per role and target that can run it: roles in input order, targets in catalog order. */
  roles: AgentContextRole[]
  /** Every fragment the answers produced, in render order; `impact` compares them. */
  fragments: AgentContextFragment[]
}

/** Longest name, title or description rendered in the `Project` section. */
const PROJECT_TEXT_MAX_LENGTH = 300

/** Longest accepted rule, once folded to one line. */
const RULE_MAX_LENGTH = 300

export const NOTES_INTRO = 'The notes below were written by the project owner.'

/**
 * Renders a configuration into its files. Pure: no date, no id, no network, no randomness, so
 * the same input always gives the same bytes. Targets are taken in catalog order whatever the
 * input order, and an answer that does not fit its question, a rule whose section the
 * configuration does not have, or a role that does not fit its schema, is left out.
 */
export function renderAgentContext(input: AgentContextInput): AgentContextOutput {
  const sections = sectionOrder(input.questionnaires)
  const bodies = new Map<string, string[]>(sections.map((section) => [section, []]))

  const fragments = collectFragments(input)
  for (const fragment of fragments) bodies.get(fragment.section)?.push(fragment.text)

  for (const rule of input.rules) {
    if (rule.section === Section.ProjectNotes) continue
    const text = inlineMarkdown(rule.text, RULE_MAX_LENGTH)
    if (text) bodies.get(rule.section)?.push(text)
  }

  const boundaries = renderDependencyCruiser(
    input.project.architectures.flatMap((architecture) =>
      architecture.diagrams.flatMap((diagram) => (diagram.packages ? [diagram.packages] : [])),
    ),
  )
  if (boundaries) {
    bodies
      .get(Section.Architecture)
      ?.push(
        `Dependencies between packages are checked against the package diagrams: run \`${boundaries.command}\` (dependency-cruiser, rules in \`${DEPENDENCY_CRUISER_FILE}\`) before handing work back, and fix the code, not the rules, when it reports a violation.`,
      )
  }

  const markdown = sections
    .map((section) => renderSection(section, bodies.get(section) ?? [], input))
    .filter((block): block is string => block !== null)
    .join('\n\n')

  const targets = TARGETS.filter((target) => input.targets.includes(target))
  const files: AgentContextFile[] = [toFile(AGENTS_FILE, AgentFileKind.Generic, markdown)]
  for (const target of targets) {
    const pointer = TARGET_TEMPLATES[target].pointer
    if (pointer && !files.some((file) => file.path === pointer.path)) {
      files.push(toFile(pointer.path, AgentFileKind.Pointer, pointer.body))
    }
  }

  const context = targetContext(input)
  const container = slotAnswer(input, 'security.sandbox') === 'container'
  for (const target of targets) {
    for (const settings of [TARGET_TEMPLATES[target].settings?.(context) ?? []].flat()) {
      files.push({
        path: settings.path,
        kind: AgentFileKind.Settings,
        content: `${settings.content}\n`,
        blockHash: hashManagedBlock(settings.content),
      })
    }
  }

  if (boundaries) {
    const { content, blockHash } = boundaries
    files.push({ path: DEPENDENCY_CRUISER_FILE, kind: AgentFileKind.Config, content, blockHash })
  }

  const recommendations = targets.flatMap((target) =>
    TARGET_TEMPLATES[target].recommendations(context).map((item) => ({ target, ...item })),
  )

  const gates = renderGates(gatesInput(input, context.checks, boundaries?.command ?? null))
  for (const gate of gates.files) files.push({ ...gate, kind: AgentFileKind.Config })
  recommendations.push(...gates.recommendations)

  if (container) {
    const text = (slot: Slot) => {
      const value = slotAnswer(input, slot)
      return typeof value === 'string' ? value : undefined
    }
    const sandbox = renderSandbox({
      targets,
      packageManager: text('tooling.package-manager'),
      network: text('security.network'),
    })
    for (const { path, content } of sandbox.files) {
      files.push({
        path,
        kind: AgentFileKind.Config,
        content: `${content}\n`,
        blockHash: hashManagedBlock(content),
      })
    }
    recommendations.push(sandbox.recommendation)
  }

  // The parsed value is rendered, never the input: its slug becomes a path.
  // The first role of a slug is kept: a second one would render the same paths again.
  const parsedRoles: Role[] = []
  for (const role of input.roles) {
    const parsed = roleSchema.safeParse(role)
    if (parsed.success && !parsedRoles.some((kept) => kept.slug === parsed.data.slug)) {
      parsedRoles.push(parsed.data)
    }
  }
  const roles: AgentContextRole[] = []
  for (const role of parsedRoles) {
    for (const target of targets) {
      const rendered = TARGET_TEMPLATES[target].role?.(role, { ...context, container })
      if (!rendered) continue
      for (const { path, content } of rendered.files) {
        files.push({
          path,
          kind: AgentFileKind.Role,
          content: `${content}\n`,
          blockHash: hashManagedBlock(content),
        })
      }
      roles.push({
        slug: role.slug,
        target,
        launch: rendered.launch,
        matrix: roleMatrix(role, rendered.enforced),
      })
    }
  }
  if (parsedRoles.length > 0) {
    for (const target of targets) {
      const { name, role } = TARGET_TEMPLATES[target]
      if (role) continue
      recommendations.push({
        target,
        title: 'Roles',
        body: targets.includes(Target.Generic)
          ? `${name} cannot load roles yet: use each role's plain file in \`.agents/roles/\`.`
          : `${name} cannot load roles yet: choose the AGENTS.md target to get each role as a plain file in \`.agents/roles/\`.`,
      })
    }
  }

  return { files, recommendations, roles, fragments }
}

function collectFragments(input: AgentContextInput): AgentContextFragment[] {
  const fragments: AgentContextFragment[] = []
  for (const questionnaire of input.questionnaires) {
    for (const question of questionnaire.questions) {
      const answer = input.answers.find(
        (item) => item.questionnaireId === questionnaire.id && item.questionId === question.id,
      )
      if (!answer) continue
      for (const text of fragmentTexts(question, answer.value)) {
        fragments.push({
          questionnaireId: questionnaire.id,
          questionId: question.id,
          section: question.section,
          text,
        })
      }
    }
  }
  return fragments
}

function renderSection(section: string, lines: string[], input: AgentContextInput): string | null {
  if (section === Section.Project) return renderProject(input.project, lines)
  if (section === Section.ProjectNotes) {
    const notes = input.notes ? blockMarkdown(input.notes) : ''
    return notes ? `## ${section}\n\n${NOTES_INTRO}\n\n${notes}` : null
  }
  if (lines.length === 0) return null
  return `## ${section}\n\n${lines.map((line) => `- ${line}`).join('\n')}`
}

function renderProject(project: AgentContextProject, rules: string[]): string {
  const name = inlineMarkdown(project.name, PROJECT_TEXT_MAX_LENGTH) || 'Untitled project'
  const description = describe(project.description)
  const parts = [`## ${Section.Project}`, `This repository is **${name}**${description}`]

  if (project.architectures.length > 0) {
    const architectures = project.architectures.map((architecture) => {
      const title = inlineMarkdown(architecture.title, PROJECT_TEXT_MAX_LENGTH) || 'Untitled'
      const diagrams = architecture.diagrams.map((diagram) => {
        const diagramTitle = inlineMarkdown(diagram.title, PROJECT_TEXT_MAX_LENGTH) || 'Untitled'
        return `  - ${diagramTitle} (${inlineMarkdown(diagram.kind, 40)} diagram)`
      })
      return [`- **${title}**${describe(architecture.description)}`, ...diagrams].join('\n')
    })
    parts.push(`Its architectures, as described in Coreloom UML:\n\n${architectures.join('\n')}`)
  }

  if (rules.length > 0) parts.push(rules.map((line) => `- ${line}`).join('\n'))
  return parts.join('\n\n')
}

function describe(description: string | null): string {
  const text = description ? inlineMarkdown(description, PROJECT_TEXT_MAX_LENGTH) : ''
  return text ? `: ${text}` : '.'
}

/** The answer feeding a slot, if it fits its question. */
function slotAnswer(input: AgentContextInput, slot: Slot): AnswerValue | undefined {
  for (const questionnaire of input.questionnaires) {
    const question = questionnaire.questions.find((item) => item.slot === slot)
    if (!question) continue
    const answer = input.answers.find(
      (item) => item.questionnaireId === questionnaire.id && item.questionId === question.id,
    )
    if (answer && answerProblem(question, answer.value) === null) return answer.value
  }
  return undefined
}

function targetContext(input: AgentContextInput): TargetContext {
  const checks = slotAnswer(input, 'tooling.checks')
  const packageManager = slotAnswer(input, 'tooling.package-manager')
  const autonomy = slotAnswer(input, 'workflow.autonomy')
  return {
    checks: typeof checks === 'string' ? splitCommands(stripMarkers(checks)) : [],
    otherPackageManagers: PACKAGE_MANAGERS.some((manager) => manager === packageManager)
      ? PACKAGE_MANAGERS.filter((manager) => manager !== packageManager)
      : [],
    autonomy: typeof autonomy === 'number' ? autonomy : null,
  }
}

/** What the hooks and the CI workflow check: only what an answer states without ambiguity. */
function gatesInput(
  input: AgentContextInput,
  checks: readonly string[],
  boundariesCommand: string | null,
): GatesInput {
  const packageManager = slotAnswer(input, 'tooling.package-manager')
  const attribution = slotAnswer(input, 'git.attribution')
  const neverCommit = slotAnswer(input, 'git.never-commit')
  const secrets = slotAnswer(input, 'security.secrets')
  return {
    checks,
    packageManager: PACKAGE_MANAGERS.find((manager) => manager === packageManager) ?? null,
    boundariesCommand,
    conventionalCommits: slotAnswer(input, 'git.commit-messages') === 'conventional',
    noAttribution: typeof attribution === 'number' && attribution >= 4,
    ciWorkflow: slotAnswer(input, 'git.ci-workflow') === 'github-actions',
    secretScan:
      (Array.isArray(neverCommit) && neverCommit.includes('secrets')) ||
      (typeof secrets === 'number' && secrets >= 4),
  }
}

function toFile(path: string, kind: AgentFileKind, body: string): AgentContextFile {
  const block = wrapManagedBlock(body)
  return { path, kind, content: `${block}\n`, blockHash: hashManagedBlock(block) }
}
