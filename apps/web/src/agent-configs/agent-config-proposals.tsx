// Proposed rules: the user's own model (set in Settings, kept in this browser) turns the diagrams
// the owner checks, or the review feedback they paste, into rules, shown in a side panel. Each one
// is accepted, edited then accepted (`POST …/rules` with `source: 'llm'`), or ignored. Nothing is
// stored before that, and the proposals stay in the panel until the page is left or the model is
// asked again.
import { WandSparklesIcon } from 'lucide-react'
import * as React from 'react'

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
import { Textarea } from '@/components/ui/textarea'
import { type AgentConfig, RULES_MAX, useCreateRule } from '@/lib/agent-configs'
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

type Source = 'diagrams' | 'feedback'

/** Longest feedback the API reads (`AGENT_PROPOSAL_FEEDBACK_MAX_LENGTH`). */
const FEEDBACK_MAX_LENGTH = 20_000

/** "Propose rules" and its panel; nothing at all while no provider is set in this browser. */
export function RuleProposals({ configId, config }: { configId: number; config: AgentConfig }) {
  const t = useT()
  const provider = useStoredProvider()
  const [open, setOpen] = React.useState(false)
  const diagrams = config.diagrams
  const [chosen, setChosen] = React.useState<Source>('diagrams')
  // Diagrams only when the configuration reads some with content.
  const source = diagrams.length > 0 ? chosen : 'feedback'
  /** The diagrams to read; `null` until the owner unchecks one, meaning all of them. */
  const [checked, setChecked] = React.useState<number[] | null>(null)
  const [feedback, setFeedback] = React.useState('')
  const [result, setResult] = React.useState<{
    proposals: Proposal[]
    truncated: boolean
    skipped: number[]
    received: number
  } | null>(null)
  const propose = useProposeRules(configId)
  const picked = diagrams
    .filter((diagram) => checked === null || checked.includes(diagram.id))
    .map((diagram) => diagram.id)

  const run = (current: StoredProvider, from: Source) => {
    setResult(null)
    propose.mutate(
      from === 'diagrams'
        ? { provider: current, from, diagramIds: picked }
        : { provider: current, from, feedback },
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
  // Diagrams are picked and feedback pasted first.
  const picking = !propose.isPending && !propose.isError && !result
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true)
        }}
      >
        <WandSparklesIcon /> {t.llm.propose}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t.llm.proposalsTitle}</SheetTitle>
            <SheetDescription>
              {{
                diagrams: t.llm.proposalsHintDiagrams,
                feedback: t.llm.proposalsHintFeedback,
              }[source](provider.model)}
            </SheetDescription>
            {diagrams.length > 0 && (
              <SourceSwitch
                value={source}
                disabled={propose.isPending}
                onChange={(next) => {
                  setChosen(next)
                  setResult(null)
                  propose.reset()
                }}
              />
            )}
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
            {picking && (
              <ProposalsInput
                source={source}
                diagrams={diagrams}
                picked={picked}
                onPick={setChecked}
                feedback={feedback}
                onFeedback={setFeedback}
              />
            )}
            {propose.isPending && <ProposalsWaiting model={provider.model} source={source} />}
            {propose.isError && <ProposalsFailed error={propose.error} />}
            {propose.isSuccess && result && (
              <ProposalsReview
                configId={configId}
                config={config}
                proposals={result.proposals}
                truncated={result.truncated}
                skipped={result.skipped}
                truncatedText={
                  source === 'feedback'
                    ? t.llm.proposalsTruncatedFeedback
                    : t.llm.proposalsTruncated
                }
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
            source={source}
            canPropose={source === 'feedback' ? feedback.trim() !== '' : picked.length > 0}
            pending={propose.isPending}
            failed={propose.isError}
            onPropose={() => {
              run(provider, source)
            }}
            onAgain={() => {
              // "Again" goes back to the picker or the pasted text.
              setResult(null)
              propose.reset()
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
  return {
    diagrams: t.llm.proposalsNoneDiagrams,
    feedback: t.llm.proposalsNoneFeedback,
  }[source]
}

/** Sends the checked diagrams or the pasted feedback; asks again once there is an answer. */
function ProposalsFooter({
  picking,
  source,
  canPropose,
  pending,
  failed,
  onPropose,
  onAgain,
}: {
  picking: boolean
  source: Source
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
          <WandSparklesIcon />{' '}
          {source === 'feedback' ? t.llm.proposeFromFeedback : t.llm.proposeFromDiagrams}
        </Button>
      ) : (
        <Button variant="outline" disabled={pending} onClick={onAgain}>
          <WandSparklesIcon /> {failed ? t.llm.retry : t.llm.proposeAgain}
        </Button>
      )}
    </SheetFooter>
  )
}

/** Where the rules come from. */
function SourceSwitch({
  value,
  disabled,
  onChange,
}: {
  value: Source
  disabled: boolean
  onChange: (source: Source) => void
}) {
  const t = useT()
  return (
    <SegmentedControl
      size="sm"
      aria-label={t.llm.proposalsFrom}
      value={value}
      disabled={disabled}
      options={[
        { value: 'diagrams', label: t.llm.fromDiagrams },
        { value: 'feedback', label: t.llm.fromFeedback },
      ]}
      onValueChange={(next) => {
        onChange(next === 'feedback' ? 'feedback' : 'diagrams')
      }}
    />
  )
}

/** What the owner gives before the model is asked: the diagrams to read, or the feedback. */
function ProposalsInput({
  source,
  diagrams,
  picked,
  onPick,
  feedback,
  onFeedback,
}: {
  source: Source
  diagrams: AgentConfig['diagrams']
  picked: number[]
  onPick: (ids: number[]) => void
  feedback: string
  onFeedback: (text: string) => void
}) {
  const t = useT()
  if (source === 'diagrams')
    return <DiagramPicker diagrams={diagrams} picked={picked} onChange={onPick} />
  return (
    <Field>
      <FieldLabel htmlFor="proposal-feedback">{t.llm.feedbackLabel}</FieldLabel>
      <Textarea
        id="proposal-feedback"
        className="min-h-64"
        maxLength={FEEDBACK_MAX_LENGTH}
        value={feedback}
        onChange={(event) => {
          onFeedback(event.target.value)
        }}
      />
    </Field>
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
            title: {
              diagrams: t.llm.proposalsStepSendDiagrams,
              feedback: t.llm.proposalsStepSendFeedback,
            }[source],
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
  configId,
  config,
  proposals,
  truncated,
  skipped,
  truncatedText,
  empty,
  onAccepted,
  onHandled,
}: {
  configId: number
  config: AgentConfig
  proposals: Proposal[]
  truncated: boolean
  /** Diagrams left out to fit the model's budget. */
  skipped: number[]
  /** Said when `truncated`; a general wording by default. */
  truncatedText?: string
  empty: string
  /** A proposal was stored as a rule (it is then handled too). */
  onAccepted?: () => void
  /** A proposal was accepted or dismissed: it leaves the list. */
  onHandled: (id: string) => void
}) {
  const t = useT()
  const create = useCreateRule(configId)
  const full = config.rules.length >= RULES_MAX

  /** `diagram:<id>` as the diagram's title, when the model named one we know. */
  const diagramTitle = (basedOn: string | null) => {
    if (!basedOn?.startsWith('diagram:')) return null
    const id = Number(basedOn.slice('diagram:'.length))
    return config.diagrams.find((diagram) => diagram.id === id)?.title ?? null
  }

  const suggestions: Suggestion[] = proposals.map((proposal) => {
    const diagram = diagramTitle(proposal.basedOn)
    return {
      id: proposal.id,
      text: proposal.text,
      label: proposal.section,
      detail: diagram ? t.llm.basedOn(diagram) : undefined,
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
            <AlertDescription>{truncatedText ?? t.llm.proposalsTruncated}</AlertDescription>
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
          onAccepted?.()
          onHandled(suggestion.id)
        }}
        onDismiss={(suggestion) => {
          onHandled(suggestion.id)
        }}
      />
    </>
  )
}
