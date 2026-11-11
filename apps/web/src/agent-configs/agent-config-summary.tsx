// A configuration: where its files stand (impact), the answers (editable in place), the
// accepted rules, the project notes and the coding tools, with "Generate" as the main action.
import { FileTextIcon, PencilIcon, SparklesIcon, Trash2Icon, WandSparklesIcon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { AgentConfigRules, type RuleDraft } from '@/agent-configs/agent-config-rules'
import { AnswerForm, CatalogText } from '@/agent-configs/answer-form'
import { useFormatAnswer, useLocalized, useTargetOptions } from '@/agent-configs/catalog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppForm } from '@/components/ui/form'
import { toast } from '@/components/ui/sonner'
import {
  type AgentConfig,
  type AgentImpact,
  answerKey,
  NOTES_MAX_LENGTH,
  type Question,
  type Questionnaire,
  TARGETS,
  useDeleteAgentConfig,
  useGenerate,
  useSaveAnswers,
  useUpdateAgentConfig,
} from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import { useT } from '@/lib/locale'

export function AgentConfigSummary({
  configId,
  config,
  impact,
  questionnaires,
  onEditAnswers,
  onShowGeneration,
  onDeleted,
}: {
  configId: number
  config: AgentConfig
  impact: AgentImpact
  questionnaires: Questionnaire[]
  onEditAnswers: () => void
  onShowGeneration: (id: number) => void
  onDeleted: () => void
}) {
  const t = useT()
  const [ruleDraft, setRuleDraft] = React.useState<RuleDraft | null>(null)
  const save = useUpdateAgentConfig(configId)

  return (
    <div className="flex flex-col gap-6">
      <GenerateBar
        configId={configId}
        config={config}
        impact={impact}
        onShowGeneration={onShowGeneration}
      />
      {config.outdatedQuestionnaires.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>{t.agents.outdatedTitle}</AlertTitle>
          <AlertDescription>{t.agents.outdatedText}</AlertDescription>
          <div className="col-start-2 mt-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={save.isPending}
              onClick={() => {
                // Saving the same questionnaires takes them at their current version.
                save.mutate(
                  { questionnaires: config.questionnaires.map((q) => q.id) },
                  {
                    onSuccess: onEditAnswers,
                    onError: (error) => toast.error(getErrorMessage(error, t.agents.failed)),
                  },
                )
              }}
            >
              {t.agents.outdatedAction}
            </Button>
          </div>
        </Alert>
      )}
      <AnswersCard
        configId={configId}
        config={config}
        questionnaires={questionnaires}
        onEditAnswers={onEditAnswers}
        onMakeRule={(section, text) => {
          setRuleDraft({
            section: config.ruleSections.includes(section)
              ? section
              : (config.ruleSections[0] ?? ''),
            text,
          })
        }}
      />
      <AgentConfigRules
        configId={configId}
        config={config}
        questionnaires={questionnaires}
        draft={ruleDraft}
        onDraftChange={setRuleDraft}
      />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <NotesCard configId={configId} config={config} />
        <TargetsCard configId={configId} config={config} />
      </div>
      <DeleteConfig configId={configId} onDeleted={onDeleted} />
    </div>
  )
}

/** What the impact says, as one sentence: the changed answers and the files they touch. */
function useImpactText() {
  const t = useT()
  return (impact: NonNullable<AgentImpact>) => {
    const files = impact.files
      .map((file) => {
        switch (file.change) {
          case 'added':
            return t.agents.fileChange.added(file.path)
          case 'removed':
            return t.agents.fileChange.removed(file.path)
          default:
            return t.agents.fileChange.modified(file.path, file.sections.join(', '))
        }
      })
      .join(' ; ')
    return files
      ? t.agents.staleText(impact.changedQuestions.length, files)
      : t.agents.staleOnlyRevision
  }
}

function GenerateBar({
  configId,
  config,
  impact,
  onShowGeneration,
}: {
  configId: number
  config: AgentConfig
  impact: AgentImpact
  onShowGeneration: (id: number) => void
}) {
  const t = useT()
  const generate = useGenerate(configId)
  const impactText = useImpactText()
  const latest = config.latestGeneration
  const stale = impact?.stale ?? false

  const run = () => {
    generate.mutate(undefined, {
      onSuccess: (generation) => {
        toast.success(t.agents.generated)
        onShowGeneration(generation.id)
      },
      onError: (error) => toast.error(getErrorMessage(error, t.agents.failed)),
    })
  }

  const action = (
    <Button onClick={run} disabled={generate.isPending} aria-busy={generate.isPending || undefined}>
      <SparklesIcon /> {latest ? t.agents.regenerate : t.agents.generate}
    </Button>
  )
  const view = latest && (
    <Button
      variant="outline"
      onClick={() => {
        onShowGeneration(latest.id)
      }}
    >
      <FileTextIcon /> {t.agents.viewLatest}
    </Button>
  )

  if (latest && stale && impact)
    return (
      <Alert variant="warning">
        <AlertTitle>{t.agents.staleTitle}</AlertTitle>
        <AlertDescription>{impactText(impact)}</AlertDescription>
        <div className="col-start-2 mt-2 flex flex-wrap gap-2">
          {view}
          {action}
        </div>
      </Alert>
    )
  return (
    <Alert variant={latest ? 'success' : 'default'}>
      <AlertTitle>{latest ? t.agents.upToDate : t.agents.neverGenerated}</AlertTitle>
      <AlertDescription>{t.agents.intro}</AlertDescription>
      <div className="col-start-2 mt-2 flex flex-wrap gap-2">
        {view}
        {action}
      </div>
    </Alert>
  )
}

function AnswersCard({
  configId,
  config,
  questionnaires,
  onEditAnswers,
  onMakeRule,
}: {
  configId: number
  config: AgentConfig
  questionnaires: Questionnaire[]
  onEditAnswers: () => void
  onMakeRule: (section: string, text: string) => void
}) {
  const t = useT()
  const localized = useLocalized()
  const answers = new Map(
    config.answers.map((answer) => [answerKey(answer.questionnaireId, answer.questionId), answer]),
  )
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.agents.answersTitle}</CardTitle>
        <CardDescription>{t.agents.answersHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {questionnaires.map((questionnaire) => (
          <section key={questionnaire.id} className="flex flex-col gap-2">
            {questionnaires.length > 1 && (
              <p className="m-0 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {localized(questionnaire.title)}
              </p>
            )}
            <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
              {questionnaire.questions.map((question) => {
                const key = answerKey(questionnaire.id, question.id)
                return (
                  <AnswerRow
                    key={key}
                    configId={configId}
                    questionnaire={questionnaire}
                    question={question}
                    answer={answers.get(key)}
                    onMakeRule={onMakeRule}
                  />
                )
              })}
            </ul>
          </section>
        ))}
        <div>
          <Button variant="outline" onClick={onEditAnswers}>
            <PencilIcon /> {t.agents.editAnswers}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function AnswerRow({
  configId,
  questionnaire,
  question,
  answer,
  onMakeRule,
}: {
  configId: number
  questionnaire: Questionnaire
  question: Question
  answer: AgentConfig['answers'][number] | undefined
  onMakeRule: (section: string, text: string) => void
}) {
  const t = useT()
  const localized = useLocalized()
  const format = useFormatAnswer()
  const save = useSaveAnswers(configId)
  const [editing, setEditing] = React.useState(false)
  const editRef = React.useRef<HTMLButtonElement>(null)
  const label = localized(question.label)

  const close = () => {
    setEditing(false)
    requestAnimationFrame(() => editRef.current?.focus())
  }

  if (editing)
    return (
      <li className="py-4">
        <AnswerForm
          question={question}
          scaleLabels={questionnaire.scaleLabels}
          initial={answer ? { value: answer.value, details: answer.details ?? '' } : undefined}
          required={false}
          onSubmit={async (draft) => {
            try {
              await save.mutateAsync([
                {
                  questionnaireId: questionnaire.id,
                  questionId: question.id,
                  value: draft.value,
                  details: draft.details || null,
                },
              ])
              toast.success(t.agents.answersSaved)
              close()
            } catch (error) {
              toast.error(getErrorMessage(error, t.agents.failed))
            }
          }}
          actions={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={close}>
                {t.agents.cancel}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {t.agents.save}
              </Button>
            </div>
          }
        />
      </li>
    )

  return (
    <li className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="m-0 text-[14px] text-foreground">
          <CatalogText text={label} />
        </p>
        <p className="m-0 text-[13px] text-fg-secondary">
          {answer ? (
            format(question, questionnaire.scaleLabels, answer.value)
          ) : (
            <span className="text-muted-foreground italic">{t.agents.notAnswered}</span>
          )}
        </p>
        {answer?.details && (
          <p className="m-0 text-[13px] whitespace-pre-wrap text-muted-foreground">
            {t.agents.detailsValue(answer.details)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        {answer?.details && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onMakeRule(question.section, answer.details ?? '')
            }}
          >
            <WandSparklesIcon /> {t.agents.detailsToRule}
          </Button>
        )}
        <Button
          ref={editRef}
          variant="ghost"
          size="sm"
          aria-label={t.agents.editAnswer(label.replaceAll('`', ''))}
          onClick={() => {
            setEditing(true)
          }}
        >
          <PencilIcon /> {t.agents.edit}
        </Button>
      </div>
    </li>
  )
}

function NotesCard({ configId, config }: { configId: number; config: AgentConfig }) {
  const t = useT()
  const save = useUpdateAgentConfig(configId)
  const form = useAppForm({
    defaultValues: { notes: config.notes ?? '' },
    validators: {
      onSubmit: z.object({
        notes: z.string().max(NOTES_MAX_LENGTH, t.agents.textTooLong(NOTES_MAX_LENGTH)),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({ notes: value.notes.trim() ? value.notes : null })
        toast.success(t.agents.notesSaved)
      } catch (error) {
        toast.error(getErrorMessage(error, t.agents.failed))
      }
    },
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.agents.notesTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.AppForm>
            <form.AppField name="notes">
              {(field) => (
                <field.TextareaField
                  label={t.agents.notesTitle}
                  hideLabel
                  description={t.agents.notesHint}
                  rows={6}
                  maxCount={NOTES_MAX_LENGTH}
                />
              )}
            </form.AppField>
            <div className="flex justify-end">
              <form.SubmitButton variant="outline">{t.agents.save}</form.SubmitButton>
            </div>
          </form.AppForm>
        </form>
      </CardContent>
    </Card>
  )
}

function TargetsCard({ configId, config }: { configId: number; config: AgentConfig }) {
  const t = useT()
  const save = useUpdateAgentConfig(configId)
  const options = useTargetOptions()
  const form = useAppForm({
    defaultValues: { targets: config.targets },
    validators: {
      onSubmit: z.object({ targets: z.array(z.enum(TARGETS)).min(1, t.agents.targetsRequired) }),
    },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({ targets: value.targets })
        toast.success(t.agents.targetsSaved)
      } catch (error) {
        toast.error(getErrorMessage(error, t.agents.failed))
      }
    },
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.agents.targetsLabel}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.AppForm>
            <form.AppField name="targets">
              {(field) => (
                <field.CheckboxCardField
                  label={t.agents.targetsLabel}
                  hideLabel
                  description={t.agents.targetsHint}
                  options={options}
                />
              )}
            </form.AppField>
            <div className="flex justify-end">
              <form.SubmitButton variant="outline">{t.agents.save}</form.SubmitButton>
            </div>
          </form.AppForm>
        </form>
      </CardContent>
    </Card>
  )
}

function DeleteConfig({ configId, onDeleted }: { configId: number; onDeleted: () => void }) {
  const t = useT()
  const remove = useDeleteAgentConfig(configId)
  const [open, setOpen] = React.useState(false)
  return (
    <div className="flex justify-end">
      <Button
        variant="ghost"
        onClick={() => {
          setOpen(true)
        }}
      >
        <Trash2Icon /> {t.agents.deleteConfig}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.agents.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.agents.deleteText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.agents.cancel}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                try {
                  await remove.mutateAsync()
                  toast.success(t.agents.deleted)
                  onDeleted()
                } catch (error) {
                  toast.error(getErrorMessage(error, t.agents.failed))
                }
              }}
            >
              {t.agents.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
