// Proposed rules: the user's own model (set in Settings, kept in this browser) turns the notes
// under the answers, or the diagrams the owner checks, into rules, shown in a side panel. Each one is accepted, edited then
// accepted (`POST …/rules` with `source: 'llm'`), or ignored. Nothing is stored before that, and
// the proposals stay in the panel until the page is left or the model is asked again.
import { WandSparklesIcon } from 'lucide-react'
import * as React from 'react'

import { useLocalized } from '@/agent-configs/catalog'
import { AgentPlan } from '@/components/ui/agent-plan'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Markdown } from '@/components/ui/markdown'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { toast } from '@/components/ui/sonner'
import { type Suggestion, SuggestionList } from '@/components/ui/suggestion-list'
import { type AgentConfig, type Questionnaire, RULES_MAX, useCreateRule } from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import { useCoreloomI18n } from '@/lib/i18n'
import {
  providerCallFailure,
  type RuleProposal,
  type StoredProvider,
  useProposeRules,
  useStoredProvider,
} from '@/lib/llm-provider'
import { useT } from '@/lib/locale'
import { useProviderFailureText } from '@/llm/provider-failure'

interface Proposal extends RuleProposal {
  id: string
}

type Source = 'answers' | 'diagrams'

/** "Propose rules" and its panel; nothing at all while no provider is set in this browser. */
export function RuleProposals({
  projectId,
  config,
  questionnaires,
}: {
  projectId: number
  config: AgentConfig
  questionnaires: Questionnaire[]
}) {
  const t = useT()
  const provider = useStoredProvider()
  const [open, setOpen] = React.useState(false)
  const [source, setSource] = React.useState<Source>('answers')
  /** The diagrams to read; `null` until the owner unchecks one, meaning all of them. */
  const [checked, setChecked] = React.useState<number[] | null>(null)
  const [result, setResult] = React.useState<{
    proposals: Proposal[]
    truncated: boolean
    skipped: number[]
    received: number
  } | null>(null)
  const propose = useProposeRules(projectId)
  const diagrams = config.diagrams
  const picked = diagrams
    .filter((diagram) => checked === null || checked.includes(diagram.id))
    .map((diagram) => diagram.id)

  const run = (current: StoredProvider, from: Source) => {
    setResult(null)
    propose.mutate(
      { provider: current, ...(from === 'diagrams' ? { diagramIds: picked } : {}) },
      {
        onSuccess: (body) => {
          setResult({
            proposals: body.proposals.map((proposal, index) => ({
              ...proposal,
              id: `${String(Date.now())}-${String(index)}`,
            })),
            truncated: body.truncated,
            skipped: body.skipped,
            received: body.proposals.length,
          })
        },
      },
    )
  }

  if (!provider) return null
  // Diagrams are picked first; the notes are sent as soon as the panel opens.
  const picking = source === 'diagrams' && !propose.isPending && !propose.isError && !result
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true)
          // Reopening shows what is left to review; an empty panel asks the model again.
          const reviewing = result !== null && result.proposals.length > 0
          if (source === 'answers' && !propose.isPending && !reviewing) run(provider, 'answers')
        }}
      >
        <WandSparklesIcon /> {t.llm.propose}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t.llm.proposalsTitle}</SheetTitle>
            <SheetDescription>
              {source === 'diagrams'
                ? t.llm.proposalsHintDiagrams(provider.model)
                : t.llm.proposalsHint(provider.model)}
            </SheetDescription>
            {diagrams.length > 0 && (
              <SegmentedControl
                size="sm"
                aria-label={t.llm.proposalsFrom}
                value={source}
                disabled={propose.isPending}
                options={[
                  { value: 'answers', label: t.llm.fromAnswers },
                  { value: 'diagrams', label: t.llm.fromDiagrams },
                ]}
                onValueChange={(value) => {
                  const next = value === 'diagrams' ? 'diagrams' : 'answers'
                  setSource(next)
                  setResult(null)
                  propose.reset()
                  if (next === 'answers') run(provider, 'answers')
                }}
              />
            )}
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
            {picking && (
              <DiagramPicker
                diagrams={diagrams}
                picked={picked}
                onChange={(ids) => {
                  setChecked(ids)
                }}
              />
            )}
            {propose.isPending && <ProposalsWaiting model={provider.model} source={source} />}
            {propose.isError && <ProposalsFailed error={propose.error} />}
            {propose.isSuccess && result && (
              <ProposalsReview
                projectId={projectId}
                config={config}
                questionnaires={questionnaires}
                proposals={result.proposals}
                truncated={result.truncated}
                skipped={result.skipped}
                empty={emptyText(t, source, result.received)}
                onHandled={(id) => {
                  setResult(
                    (left) =>
                      left && {
                        ...left,
                        proposals: left.proposals.filter((proposal) => proposal.id !== id),
                      },
                  )
                }}
              />
            )}
          </div>
          <ProposalsFooter
            picking={picking}
            canPropose={picked.length > 0}
            pending={propose.isPending}
            failed={propose.isError}
            onPropose={() => {
              run(provider, 'diagrams')
            }}
            onAgain={() => {
              // From diagrams, "again" goes back to the picker; the notes are sent at once.
              if (source === 'diagrams') {
                setResult(null)
                propose.reset()
              } else {
                run(provider, 'answers')
              }
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}

type Messages = ReturnType<typeof useT>

function emptyText(t: Messages, source: Source, received: number): string {
  if (received > 0) return t.llm.proposalsEmpty
  return source === 'diagrams' ? t.llm.proposalsNoneDiagrams : t.llm.proposalsNone
}

/** Sends the checked diagrams while picking them; asks again once there is an answer. */
function ProposalsFooter({
  picking,
  canPropose,
  pending,
  failed,
  onPropose,
  onAgain,
}: {
  picking: boolean
  canPropose: boolean
  pending: boolean
  failed: boolean
  onPropose: () => void
  onAgain: () => void
}) {
  const t = useT()
  return (
    <SheetFooter>
      {picking ? (
        <Button disabled={!canPropose} onClick={onPropose}>
          <WandSparklesIcon /> {t.llm.proposeFromDiagrams}
        </Button>
      ) : (
        <Button variant="outline" disabled={pending} onClick={onAgain}>
          <WandSparklesIcon /> {failed ? t.llm.retry : t.llm.proposeAgain}
        </Button>
      )}
    </SheetFooter>
  )
}

/** The project's diagrams with content, all checked at first, in the order they are sent. */
function DiagramPicker({
  diagrams,
  picked,
  onChange,
}: {
  diagrams: AgentConfig['diagrams']
  picked: number[]
  onChange: (ids: number[]) => void
}) {
  const t = useT()
  const kinds = useCoreloomI18n().messages.diagram.kinds
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium">{t.llm.diagramsPick}</legend>
      {diagrams.map((diagram) => (
        <Field key={diagram.id} orientation="horizontal">
          <Checkbox
            id={`proposal-diagram-${String(diagram.id)}`}
            checked={picked.includes(diagram.id)}
            onCheckedChange={(value) => {
              onChange(
                value === true ? [...picked, diagram.id] : picked.filter((id) => id !== diagram.id),
              )
            }}
          />
          <FieldLabel htmlFor={`proposal-diagram-${String(diagram.id)}`} className="font-normal">
            {diagram.title}
            <span className="text-muted-foreground">
              {' '}
              · {diagram.architecture} · {kinds[diagram.kind]}
            </span>
          </FieldLabel>
        </Field>
      ))}
    </fieldset>
  )
}

/** While the model works: what was sent, who is answering, what comes next. */
function ProposalsWaiting({ model, source }: { model: string; source: Source }) {
  const t = useT()
  return (
    <AgentPlan
      label={t.llm.proposalsPlan}
      active
      announce
      plan={{
        steps: [
          {
            id: 'send',
            title:
              source === 'diagrams' ? t.llm.proposalsStepSendDiagrams : t.llm.proposalsStepSend,
            status: 'done',
          },
          { id: 'wait', title: t.llm.proposalsStepWait(model), status: 'running' },
          { id: 'review', title: t.llm.proposalsStepReview, status: 'pending' },
        ],
      }}
    />
  )
}

export function ProposalsFailed({ error }: { error: unknown }) {
  const failureText = useProviderFailureText()
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{failureText(providerCallFailure(error))}</AlertDescription>
    </Alert>
  )
}

export function ProposalsReview({
  projectId,
  config,
  questionnaires,
  proposals,
  truncated,
  skipped,
  empty,
  onHandled,
}: {
  projectId: number
  config: AgentConfig
  questionnaires: Questionnaire[]
  proposals: Proposal[]
  truncated: boolean
  /** Diagrams left out to fit the model's budget. */
  skipped: number[]
  empty: string
  onHandled: (id: string) => void
}) {
  const t = useT()
  const localized = useLocalized()
  const create = useCreateRule(projectId)
  const full = config.rules.length >= RULES_MAX

  /**
   * `questionnaireId/questionId` as the question's label, or `diagram:<id>` as the diagram's
   * title, when the model named one we know.
   */
  const questionLabel = (basedOn: string | null) => {
    if (!basedOn) return null
    if (basedOn.startsWith('diagram:')) {
      const id = Number(basedOn.slice('diagram:'.length))
      return config.diagrams.find((diagram) => diagram.id === id)?.title ?? null
    }
    const [questionnaireId, questionId] = basedOn.split('/')
    const question = questionnaires
      .find((q) => q.id === questionnaireId)
      ?.questions.find((q) => q.id === questionId)
    return question ? localized(question.label) : null
  }

  const suggestions: Suggestion[] = proposals.map((proposal) => {
    const question = questionLabel(proposal.basedOn)
    return {
      id: proposal.id,
      text: proposal.text,
      label: proposal.section,
      detail: question ? <Markdown inline>{t.llm.basedOn(question)}</Markdown> : undefined,
    }
  })
  const byId = new Map(proposals.map((proposal) => [proposal.id, proposal]))

  return (
    <>
      {skipped.length > 0 ? (
        <Alert>
          <AlertDescription>
            {t.llm.proposalsSkipped(
              config.diagrams
                .filter((diagram) => skipped.includes(diagram.id))
                .map((diagram) => diagram.title)
                .join(', '),
            )}
          </AlertDescription>
        </Alert>
      ) : (
        truncated && (
          <Alert>
            <AlertDescription>{t.llm.proposalsTruncated}</AlertDescription>
          </Alert>
        )
      )}
      {full && proposals.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>{t.llm.rulesFull}</AlertDescription>
        </Alert>
      )}
      <SuggestionList
        aria-label={t.llm.proposalsTitle}
        suggestions={suggestions}
        disabled={full}
        renderText={(text) => <Markdown inline>{text}</Markdown>}
        empty={empty}
        onAccept={async (suggestion, text) => {
          const proposal = byId.get(suggestion.id)
          if (!proposal) return
          try {
            await create.mutateAsync({ section: proposal.section, text, source: 'llm' })
          } catch (error) {
            toast.error(getErrorMessage(error, t.llm.failed))
            throw error
          }
          toast.success(t.llm.accepted)
          onHandled(suggestion.id)
        }}
        onDismiss={(suggestion) => {
          onHandled(suggestion.id)
        }}
      />
    </>
  )
}
