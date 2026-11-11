// The questionnaire, one question per screen. Answers are kept as a draft in this browser
// (`agent-config-draft:config:<configId>`) until they are saved, at the end or with "Save and leave".
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { AnswerForm } from '@/agent-configs/answer-form'
import { type DraftAnswer, useLocalized } from '@/agent-configs/catalog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/sonner'
import { Stepper } from '@/components/ui/stepper'
import {
  type AgentConfig,
  type AnswerChange,
  answerKey,
  type Question,
  type Questionnaire,
  useSaveAnswers,
} from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import { useT } from '@/lib/locale'

interface Step {
  questionnaire: Questionnaire
  question: Question
  key: string
}

interface Draft {
  answers: Partial<Record<string, DraftAnswer>>
  index: number
}

/** A draft read back from storage: anything else is ignored. */
const draftSchema = z.object({
  answers: z.record(
    z.string(),
    z.object({
      value: z.union([z.number(), z.string(), z.array(z.string())]).nullable(),
      details: z.string(),
    }),
  ),
  index: z.number().int().min(0),
})

const draftKey = (configId: number) => `agent-config-draft:config:${configId}`

function readDraft(configId: number): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(configId))
    if (!raw) return null
    const draft = draftSchema.safeParse(JSON.parse(raw))
    return draft.success ? draft.data : null
  } catch {
    return null
  }
}

function writeDraft(configId: number, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(draftKey(configId), JSON.stringify(draft))
    else localStorage.removeItem(draftKey(configId))
  } catch {
    // Storage can be blocked: the draft then lasts as long as the page.
  }
}

function savedAnswers(config: AgentConfig): Partial<Record<string, DraftAnswer>> {
  return Object.fromEntries(
    config.answers.map((answer) => [
      answerKey(answer.questionnaireId, answer.questionId),
      { value: answer.value, details: answer.details ?? '' },
    ]),
  )
}

/** What changed between the saved answers and the draft, as `PUT …/answers` takes it. */
function changes(steps: Step[], config: AgentConfig, draft: Draft): AnswerChange[] {
  const saved = savedAnswers(config)
  return steps.flatMap(({ questionnaire, question, key }): AnswerChange[] => {
    const before = saved[key]
    const after = draft.answers[key]
    if (!after) return []
    const value = after.value
    if (value === null) {
      return before ? [{ questionnaireId: questionnaire.id, questionId: question.id, value }] : []
    }
    const details = after.details.trim() || null
    if (
      before &&
      JSON.stringify(before.value) === JSON.stringify(value) &&
      (before.details || null) === details
    )
      return []
    return [{ questionnaireId: questionnaire.id, questionId: question.id, value, details }]
  })
}

export function AgentConfigQuestions({
  configId,
  config,
  questionnaires,
  onDone,
}: {
  configId: number
  config: AgentConfig
  questionnaires: Questionnaire[]
  onDone: () => void
}) {
  const t = useT()
  const localized = useLocalized()
  const save = useSaveAnswers(configId)
  const steps = React.useMemo<Step[]>(
    () =>
      questionnaires.flatMap((questionnaire) =>
        questionnaire.questions.map((question) => ({
          questionnaire,
          question,
          key: answerKey(questionnaire.id, question.id),
        })),
      ),
    [questionnaires],
  )
  const sections = React.useMemo(() => [...new Set(steps.map((s) => s.question.section))], [steps])

  const [restored] = React.useState(() => readDraft(configId))
  const [draft, setDraft] = React.useState<Draft>(
    () => restored ?? { answers: savedAnswers(config), index: 0 },
  )
  React.useEffect(() => {
    if (restored) toast.info(t.agents.draftRestored)
  }, [restored, t])

  const index = Math.min(draft.index, steps.length - 1)
  const step = steps.at(index)
  const update = (next: Draft) => {
    setDraft(next)
    writeDraft(configId, next)
  }

  const finish = async (final: Draft) => {
    try {
      const body = changes(steps, config, final)
      if (body.length > 0) await save.mutateAsync(body)
      writeDraft(configId, null)
      toast.success(t.agents.answersSaved)
      onDone()
    } catch (error) {
      setDraft(final)
      toast.error(getErrorMessage(error, t.agents.failed))
    }
  }

  if (!step) return null
  const isLast = index === steps.length - 1
  const sectionIndex = sections.indexOf(step.question.section)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{localized(step.questionnaire.title)}</CardTitle>
        <CardDescription>{t.agents.questionOf(index + 1, steps.length)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Stepper
          aria-label={t.agents.sectionsLabel}
          steps={sections.map((section) => ({ title: section }))}
          current={sectionIndex}
          onStepChange={(target) => {
            const first = steps.findIndex((s) => s.question.section === sections[target])
            if (first >= 0) update({ ...draft, index: first })
          }}
        />
        <AnswerForm
          // A new form for each question: its fields start from that question's draft.
          key={step.key}
          question={step.question}
          scaleLabels={step.questionnaire.scaleLabels}
          initial={draft.answers[step.key]}
          required={step.question.required}
          onChange={(answer) => {
            update({ ...draft, answers: { ...draft.answers, [step.key]: answer } })
          }}
          onSubmit={async (answer) => {
            const next = { answers: { ...draft.answers, [step.key]: answer }, index: index + 1 }
            if (isLast) await finish({ ...next, index })
            else update(next)
          }}
          actions={
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={index === 0}
                  onClick={() => {
                    update({ ...draft, index: index - 1 })
                  }}
                >
                  <ArrowLeftIcon /> {t.agents.previous}
                </Button>
                {!step.question.required && !isLast && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      update({ ...draft, index: index + 1 })
                    }}
                  >
                    {t.agents.skip}
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => void finish(draft)}
                >
                  {t.agents.saveAndExit}
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {isLast ? (
                    t.agents.finish
                  ) : (
                    <>
                      {t.agents.next} <ArrowRightIcon />
                    </>
                  )}
                </Button>
              </div>
            </div>
          }
        />
      </CardContent>
    </Card>
  )
}
