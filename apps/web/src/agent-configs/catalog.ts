// The catalog as the screen reads it: texts in the app's language, answers as sentences, the
// coding tools as options, and the conversion between an answer and the fields of its form.
import * as React from 'react'
import { z } from 'zod'

import {
  ANSWER_DETAILS_MAX_LENGTH,
  ANSWER_TEXT_MAX_LENGTH,
  type AnswerValue,
  type Localized,
  type Question,
  type Questionnaire,
  TARGETS,
} from '@/lib/agent-configs'
import { useLocale, useT } from '@/lib/locale'

/** An answer being written: its value (`null` before one is given) and its details. */
export interface DraftAnswer {
  value: AnswerValue | null
  details: string
}

/** The catalog's text in the app's language. */
export function useLocalized() {
  const { locale } = useLocale()
  return React.useCallback((text: Localized) => text[locale], [locale])
}

/** An answer as a sentence, for the summary. */
export function useFormatAnswer() {
  const t = useT()
  const localized = useLocalized()
  return (question: Question, scaleLabels: Questionnaire['scaleLabels'], value: AnswerValue) => {
    const options = question.options ?? []
    const label = (v: string) => {
      const option = options.find((o) => o.value === v)
      return option ? localized(option.label) : v
    }
    if (typeof value === 'number')
      return t.agents.scaleValue(value, localized(scaleLabels.min), localized(scaleLabels.max))
    if (Array.isArray(value)) return value.map(label).join(', ')
    return label(value)
  }
}

export interface AnswerFields {
  scale: number | null
  choice: string
  other: string
  picks: string[]
  text: string
  details: string
}

export function toFields(question: Question, draft: DraftAnswer | undefined): AnswerFields {
  const fields: AnswerFields = {
    scale: null,
    choice: '',
    other: '',
    picks: [],
    text: '',
    details: draft?.details ?? '',
  }
  const value = draft?.value ?? null
  if (value === null) return fields
  if (typeof value === 'number') return { ...fields, scale: value }
  if (Array.isArray(value)) return { ...fields, picks: value }
  if (question.type !== 'single') return { ...fields, text: value }
  const options = question.options ?? []
  if (options.some((option) => option.value === value)) return { ...fields, choice: value }
  // Not a listed option: the free text of the "Other" option.
  const freeText = options.find((option) => option.freeText)
  return freeText ? { ...fields, choice: freeText.value, other: value } : fields
}

export function fromFields(question: Question, fields: AnswerFields): DraftAnswer {
  const details = fields.details.trim()
  switch (question.type) {
    case 'scale':
      return { value: fields.scale, details }
    case 'multi':
      return { value: fields.picks.length > 0 ? fields.picks : null, details }
    case 'text':
      return { value: fields.text.trim() || null, details }
    case 'single': {
      if (!fields.choice) return { value: null, details }
      const option = question.options?.find((o) => o.value === fields.choice)
      return { value: option?.freeText ? fields.other.trim() || null : fields.choice, details }
    }
  }
}

/** The answer's checks: lengths, the "Other" text, and an answer when the question needs one. */
export function useAnswerSchema(question: Question, required: boolean) {
  const t = useT()
  const freeText = question.options?.find((option) => option.freeText)
  return z
    .object({
      scale: z.number().nullable(),
      choice: z.string(),
      other: z.string().max(ANSWER_TEXT_MAX_LENGTH, t.agents.textTooLong(ANSWER_TEXT_MAX_LENGTH)),
      picks: z.array(z.string()),
      text: z.string().max(ANSWER_TEXT_MAX_LENGTH, t.agents.textTooLong(ANSWER_TEXT_MAX_LENGTH)),
      details: z
        .string()
        .max(ANSWER_DETAILS_MAX_LENGTH, t.agents.textTooLong(ANSWER_DETAILS_MAX_LENGTH)),
    })
    .superRefine((fields, ctx) => {
      if (question.type === 'single' && fields.choice === freeText?.value && !fields.other.trim()) {
        ctx.addIssue({ code: 'custom', path: ['other'], message: t.agents.otherRequired })
        return
      }
      if (required && fromFields(question, fields).value === null) {
        const path = { scale: 'scale', single: 'choice', multi: 'picks', text: 'text' }[
          question.type
        ]
        ctx.addIssue({ code: 'custom', path: [path], message: t.agents.answerRequired })
      }
    })
}

/** The coding tools as checkbox cards, each saying which files it gets. */
export function useTargetOptions() {
  const t = useT()
  return TARGETS.map((target) => ({
    value: target,
    title: t.agents.targetNames[target],
    description: t.agents.targetFiles[target],
  }))
}
