// Proposed rules: the user's own model (set in Settings, kept in this browser) turns the notes
// under the answers into rules, shown in a side panel. Each one is accepted, edited then
// accepted (`POST …/rules` with `source: 'llm'`), or ignored. Nothing is stored before that, and
// the proposals stay in the panel until the page is left or the model is asked again.
import { WandSparklesIcon } from 'lucide-react'
import * as React from 'react'

import { useLocalized } from '@/agent-configs/catalog'
import { AgentPlan } from '@/components/ui/agent-plan'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
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
  const [result, setResult] = React.useState<{
    proposals: Proposal[]
    truncated: boolean
    received: number
  } | null>(null)
  const propose = useProposeRules(projectId)

  const run = (current: StoredProvider) => {
    setResult(null)
    propose.mutate(current, {
      onSuccess: (body) => {
        setResult({
          proposals: body.proposals.map((proposal, index) => ({
            ...proposal,
            id: `${String(Date.now())}-${String(index)}`,
          })),
          truncated: body.truncated,
          received: body.proposals.length,
        })
      },
    })
  }

  if (!provider) return null
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true)
          // Reopening shows what is left to review; an empty panel asks the model again.
          if (!propose.isPending && (!result || result.proposals.length === 0)) run(provider)
        }}
      >
        <WandSparklesIcon /> {t.llm.propose}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{t.llm.proposalsTitle}</SheetTitle>
            <SheetDescription>{t.llm.proposalsHint(provider.model)}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
            {propose.isPending && <ProposalsWaiting model={provider.model} />}
            {propose.isError && <ProposalsFailed error={propose.error} />}
            {propose.isSuccess && result && (
              <ProposalsReview
                projectId={projectId}
                config={config}
                questionnaires={questionnaires}
                proposals={result.proposals}
                truncated={result.truncated}
                empty={result.received === 0 ? t.llm.proposalsNone : t.llm.proposalsEmpty}
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
          <SheetFooter>
            <Button
              variant="outline"
              disabled={propose.isPending}
              onClick={() => {
                run(provider)
              }}
            >
              <WandSparklesIcon /> {propose.isError ? t.llm.retry : t.llm.proposeAgain}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

/** While the model works: what was sent, who is answering, what comes next. */
function ProposalsWaiting({ model }: { model: string }) {
  const t = useT()
  return (
    <AgentPlan
      label={t.llm.proposalsPlan}
      active
      announce
      plan={{
        steps: [
          { id: 'send', title: t.llm.proposalsStepSend, status: 'done' },
          { id: 'wait', title: t.llm.proposalsStepWait(model), status: 'running' },
          { id: 'review', title: t.llm.proposalsStepReview, status: 'pending' },
        ],
      }}
    />
  )
}

function ProposalsFailed({ error }: { error: unknown }) {
  const failureText = useProviderFailureText()
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{failureText(providerCallFailure(error))}</AlertDescription>
    </Alert>
  )
}

function ProposalsReview({
  projectId,
  config,
  questionnaires,
  proposals,
  truncated,
  empty,
  onHandled,
}: {
  projectId: number
  config: AgentConfig
  questionnaires: Questionnaire[]
  proposals: Proposal[]
  truncated: boolean
  empty: string
  onHandled: (id: string) => void
}) {
  const t = useT()
  const localized = useLocalized()
  const create = useCreateRule(projectId)
  const full = config.rules.length >= RULES_MAX

  /** `questionnaireId/questionId` as the question's label, when the model named one we know. */
  const questionLabel = (basedOn: string | null) => {
    if (!basedOn) return null
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
      {truncated && (
        <Alert>
          <AlertDescription>{t.llm.proposalsTruncated}</AlertDescription>
        </Alert>
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
