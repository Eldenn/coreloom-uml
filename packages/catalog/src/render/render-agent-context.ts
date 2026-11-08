import { fragmentTexts } from '../answers.ts'
import type { AnswerValue, Questionnaire } from '../schemas.ts'
import { Section, sectionOrder } from '../sections.ts'
import { TARGET_TEMPLATES } from '../targets/index.ts'
import type { Recommendation } from '../targets/types.ts'
import { AGENTS_FILE, AgentFileKind, TARGETS, type Target } from '../targets.ts'
import { hashManagedBlock, wrapManagedBlock } from './managed-block.ts'
import { blockMarkdown, inlineMarkdown, oneLine } from './markdown.ts'

export type AgentContextProject = {
  name: string
  description: string | null
  architectures: {
    title: string
    description: string | null
    diagrams: { kind: string; title: string }[]
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
}

export type AgentContextFile = {
  path: string
  kind: AgentFileKind
  /** The managed block, followed by one line break. */
  content: string
  /** `sha256:<hex>` of the block, markers included. */
  blockHash: string
}

export type AgentContextFragment = {
  questionnaireId: string
  questionId: string
  section: string
  text: string
}

export type AgentContextOutput = {
  files: AgentContextFile[]
  recommendations: Recommendation[]
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
 * input order, and an answer that does not fit its question, or a rule whose section the
 * configuration does not have, is left out.
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

  const checks = checksAnswer(input)
  const recommendations = targets.flatMap((target) =>
    TARGET_TEMPLATES[target].recommendations({ checks }).map((item) => ({ target, ...item })),
  )

  return { files, recommendations, fragments }
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

function checksAnswer(input: AgentContextInput): string | null {
  for (const questionnaire of input.questionnaires) {
    const question = questionnaire.questions.find((item) => item.slot === 'tooling.checks')
    if (!question) continue
    const answer = input.answers.find(
      (item) => item.questionnaireId === questionnaire.id && item.questionId === question.id,
    )
    if (typeof answer?.value === 'string' && answer.value.trim()) return oneLine(answer.value)
  }
  return null
}

function toFile(path: string, kind: AgentFileKind, body: string): AgentContextFile {
  const block = wrapManagedBlock(body)
  return { path, kind, content: `${block}\n`, blockHash: hashManagedBlock(block) }
}
