// Import: the user's own model reads a conventions file pasted here and proposes answers (applied
// together; one that would replace the owner's starts unchecked) and rules (accepted one by one,
// as proposals). Nothing is stored before that.
import { FileInputIcon } from 'lucide-react'
import * as React from 'react'

import { ProposalsFailed, ProposalsReview } from '@/agent-configs/agent-config-proposals'
import { CatalogText } from '@/agent-configs/answer-form'
import { useFormatAnswer, useLocalized } from '@/agent-configs/catalog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { type AgentConfig, type Questionnaire, useSaveAnswers } from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import { type ImportedAnswer, useImportAgentFile, useStoredProvider } from '@/lib/llm-provider'
import { useT } from '@/lib/locale'

/** `questionnaireId/questionId`, the key of an answer. */
const answerKey = (answer: { questionnaireId: string; questionId: string }) =>
  `${answer.questionnaireId}/${answer.questionId}`

interface Result {
  answers: ImportedAnswer[]
  rules: { id: string; section: string; text: string; basedOn: null }[]
  truncated: boolean
}

/** "Import a file" and its panel; nothing at all while no provider is set in this browser. */
export function AgentFileImport({
  configId,
  config,
  questionnaires,
}: {
  configId: number
  config: AgentConfig
  questionnaires: Questionnaire[]
}) {
  const t = useT()
  const provider = useStoredProvider()
  const [open, setOpen] = React.useState(false)
  const [content, setContent] = React.useState('')
  const [result, setResult] = React.useState<Result | null>(null)
  const [checked, setChecked] = React.useState<Set<string>>(() => new Set())
  const read = useImportAgentFile(configId)

  if (!provider) return null

  const run = () => {
    read.mutate(
      { provider, content },
      {
        onSuccess: (body) => {
          const current = new Set(config.answers.map(answerKey))
          setChecked(
            new Set(
              body.answers.filter((answer) => !current.has(answerKey(answer))).map(answerKey),
            ),
          )
          setResult({
            answers: body.answers,
            rules: body.rules.map((rule, index) => ({
              ...rule,
              id: `${String(Date.now())}-${String(index)}`,
              basedOn: null,
            })),
            truncated: body.truncated,
          })
        },
      },
    )
  }

  const reset = () => {
    setResult(null)
    read.reset()
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true)
        }}
      >
        <FileInputIcon /> {t.llm.importFile}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t.llm.importTitle}</SheetTitle>
            <SheetDescription>{t.llm.importHint(provider.model)}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
            {!result && (
              <Field>
                <FieldLabel htmlFor="agent-file-import">{t.llm.importLabel}</FieldLabel>
                <Textarea
                  id="agent-file-import"
                  className="min-h-64 font-mono text-xs"
                  maxLength={50_000}
                  value={content}
                  disabled={read.isPending}
                  onChange={(event) => {
                    setContent(event.target.value)
                  }}
                />
              </Field>
            )}
            {read.isPending && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> {t.llm.importReading(provider.model)}
              </p>
            )}
            {read.isError && <ProposalsFailed error={read.error} />}
            {result && (
              <>
                {result.truncated && (
                  <Alert>
                    <AlertDescription>{t.llm.importTruncated}</AlertDescription>
                  </Alert>
                )}
                <ImportedAnswers
                  configId={configId}
                  config={config}
                  questionnaires={questionnaires}
                  answers={result.answers}
                  checked={checked}
                  onCheckedChange={setChecked}
                  onApplied={(keys) => {
                    setResult((left) =>
                      left
                        ? {
                            ...left,
                            answers: left.answers.filter((answer) => !keys.has(answerKey(answer))),
                          }
                        : left,
                    )
                  }}
                />
                <section aria-labelledby="agent-import-rules" className="flex flex-col gap-3">
                  <h3 id="agent-import-rules" className="text-sm font-medium">
                    {t.llm.importRules}
                  </h3>
                  <ProposalsReview
                    configId={configId}
                    config={config}
                    questionnaires={questionnaires}
                    proposals={result.rules}
                    truncated={false}
                    skipped={[]}
                    empty={t.llm.importNoRules}
                    onHandled={(id) => {
                      setResult((left) =>
                        left
                          ? { ...left, rules: left.rules.filter((rule) => rule.id !== id) }
                          : left,
                      )
                    }}
                  />
                </section>
              </>
            )}
          </div>
          <SheetFooter>
            {result ? (
              <Button variant="outline" onClick={reset}>
                <FileInputIcon /> {t.llm.importAgain}
              </Button>
            ) : (
              <Button disabled={read.isPending || !content.trim()} onClick={run}>
                <FileInputIcon /> {read.isError ? t.llm.retry : t.llm.importRun}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** The proposed answers, each with the words it comes from; the checked ones are applied at once. */
function ImportedAnswers({
  configId,
  config,
  questionnaires,
  answers,
  checked,
  onCheckedChange,
  onApplied,
}: {
  configId: number
  config: AgentConfig
  questionnaires: Questionnaire[]
  answers: ImportedAnswer[]
  checked: Set<string>
  onCheckedChange: (checked: Set<string>) => void
  onApplied: (keys: Set<string>) => void
}) {
  const t = useT()
  const localized = useLocalized()
  const format = useFormatAnswer()
  const save = useSaveAnswers(configId)
  const picked = answers.filter((answer) => checked.has(answerKey(answer)))

  const rows = answers.flatMap((answer) => {
    const questionnaire = questionnaires.find((item) => item.id === answer.questionnaireId)
    const question = questionnaire?.questions.find((item) => item.id === answer.questionId)
    if (!questionnaire || !question) return []
    const current = config.answers.find((item) => answerKey(item) === answerKey(answer))
    return [{ answer, questionnaire, question, current }]
  })

  return (
    <section aria-labelledby="agent-import-answers" className="flex flex-col gap-3">
      <h3 id="agent-import-answers" className="text-sm font-medium">
        {t.llm.importAnswers}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.llm.importNoAnswers}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t.llm.importAnswersHint}</p>
          {rows.map(({ answer, questionnaire, question, current }) => {
            const key = answerKey(answer)
            const id = `agent-import-${key.replace('/', '-')}`
            return (
              <Field key={key} orientation="horizontal" className="items-start">
                <Checkbox
                  id={id}
                  checked={checked.has(key)}
                  onCheckedChange={(value) => {
                    const next = new Set(checked)
                    if (value === true) next.add(key)
                    else next.delete(key)
                    onCheckedChange(next)
                  }}
                />
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor={id}>
                    <CatalogText text={localized(question.label)} />
                  </FieldLabel>
                  <span className="text-sm">
                    {format(question, questionnaire.scaleLabels, answer.value)}
                  </span>
                  {current && (
                    <FieldDescription>
                      {t.llm.importReplaces(
                        format(question, questionnaire.scaleLabels, current.value),
                      )}
                    </FieldDescription>
                  )}
                  {answer.evidence && (
                    <blockquote className="border-l-2 pl-2 text-xs text-muted-foreground">
                      {answer.evidence}
                    </blockquote>
                  )}
                </div>
              </Field>
            )
          })}
          <Button
            className="self-start"
            disabled={picked.length === 0 || save.isPending}
            onClick={() => {
              save.mutate(
                picked.map(({ questionnaireId, questionId, value }) => ({
                  questionnaireId,
                  questionId,
                  value,
                })),
                {
                  onSuccess: () => {
                    toast.success(t.llm.importApplied)
                    onApplied(new Set(picked.map(answerKey)))
                  },
                  onError: (error) => toast.error(getErrorMessage(error, t.llm.failed)),
                },
              )
            }}
          >
            {t.llm.importApply(picked.length)}
          </Button>
        </>
      )}
    </section>
  )
}
