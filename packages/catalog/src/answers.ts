import { inlineMarkdown } from './render/markdown.ts'
import {
  ANSWER_TEXT_MAX_LENGTH,
  type AnswerValue,
  FRAGMENT_VALUE_MAX_LENGTH,
  type Fragment,
  type Question,
  type Questionnaire,
  SCALE_MAX,
  SCALE_MIN,
} from './schemas.ts'

/**
 * Why an answer does not fit its question, or `null` when it does: a scale is a whole number
 * from 1 to 5; a single choice is a listed option, or any text when the question has a
 * `freeText` option; a multiple choice is a non-empty list of distinct listed options where an
 * `exclusive` one stands alone; a text is non-blank. Texts are at most 500 characters.
 */
export function answerProblem(question: Question, value: AnswerValue): string | null {
  const options = question.options ?? []
  const values = options.map((option) => option.value)
  switch (question.type) {
    case 'scale':
      return typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= SCALE_MIN &&
        value <= SCALE_MAX
        ? null
        : `Expected a whole number from ${SCALE_MIN} to ${SCALE_MAX}`
    case 'single': {
      if (typeof value !== 'string') return 'Expected one option'
      if (values.includes(value)) return null
      if (!options.some((option) => option.freeText)) return `Unknown option: ${value}`
      return textProblem(value)
    }
    case 'multi': {
      if (!Array.isArray(value) || value.length === 0) return 'Expected at least one option'
      const unknown = value.find((item) => !values.includes(item))
      if (unknown !== undefined) return `Unknown option: ${unknown}`
      if (new Set(value).size !== value.length) return 'An option is picked twice'
      const exclusive = options.find((option) => option.exclusive && value.includes(option.value))
      if (exclusive && value.length > 1) return `${exclusive.value} cannot be combined`
      return null
    }
    case 'text':
      return typeof value === 'string' ? textProblem(value) : 'Expected text'
  }
}

function textProblem(value: string): string | null {
  if (value.trim() === '') return 'Expected a non-blank text'
  if (value.length > ANSWER_TEXT_MAX_LENGTH) {
    return `Expected at most ${ANSWER_TEXT_MAX_LENGTH} characters`
  }
  return null
}

/** Whether a single-choice answer is free text rather than one of the listed options. */
function isOther(question: Question, value: AnswerValue): boolean {
  return (
    question.type === 'single' &&
    typeof value === 'string' &&
    !(question.options ?? []).some((option) => option.value === value)
  )
}

function matches(question: Question, fragment: Fragment, value: AnswerValue): boolean {
  const { when } = fragment
  if (
    when.scaleAtLeast !== undefined &&
    !(typeof value === 'number' && value >= when.scaleAtLeast)
  ) {
    return false
  }
  if (when.scaleAtMost !== undefined && !(typeof value === 'number' && value <= when.scaleAtMost)) {
    return false
  }
  if (when.equals !== undefined && value !== when.equals) return false
  if (when.includes !== undefined && !(Array.isArray(value) && value.includes(when.includes))) {
    return false
  }
  if (when.other && !isOther(question, value)) return false
  return true
}

/**
 * The fragment texts an answer produces, in declaration order, with `{value}` replaced by the
 * answer folded to one line, cut to 200 characters and escaped for Markdown. An answer that
 * does not fit its question produces nothing.
 */
export function fragmentTexts(question: Question, value: AnswerValue): string[] {
  if (answerProblem(question, value) !== null) return []
  const inlined =
    typeof value === 'string' ? inlineMarkdown(value, FRAGMENT_VALUE_MAX_LENGTH) : undefined
  return question.fragments
    .filter((fragment) => matches(question, fragment, value))
    .map((fragment) =>
      inlined === undefined ? fragment.text : fragment.text.replaceAll('{value}', inlined),
    )
}

export type StoredAnswer = {
  questionnaireId: string
  questionId: string
  value: AnswerValue
}

/**
 * Applies a questionnaire's `migrations` to answers saved against an older version: a removed
 * option is replaced by its successor, or dropped. A multiple choice left empty, or an answer
 * whose question no longer exists, is removed. Answers to other questionnaires pass through.
 */
export function migrateAnswers<A extends StoredAnswer>(
  questionnaire: Questionnaire,
  answers: readonly A[],
): A[] {
  const migrated: A[] = []
  for (const answer of answers) {
    if (answer.questionnaireId !== questionnaire.id) {
      migrated.push(answer)
      continue
    }
    if (!questionnaire.questions.some((question) => question.id === answer.questionId)) continue
    const replacements = questionnaire.migrations?.[answer.questionId]
    if (!replacements) {
      migrated.push(answer)
      continue
    }
    const replace = (option: string) =>
      Object.hasOwn(replacements, option) ? replacements[option] : option
    if (Array.isArray(answer.value)) {
      const values = [
        ...new Set(answer.value.map(replace).filter((option): option is string => !!option)),
      ]
      if (values.length > 0) migrated.push({ ...answer, value: values })
    } else if (typeof answer.value === 'string') {
      const value = replace(answer.value)
      if (value) migrated.push({ ...answer, value })
    } else {
      migrated.push(answer)
    }
  }
  return migrated
}
