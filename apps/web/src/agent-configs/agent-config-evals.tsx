// "Test these conventions", on a configuration's page (behind `convention-evals`): what a test
// would run with the provider this browser keeps, a confirmation that says what it costs (and, when
// the coding agent's own CLI runs with the saved key, that the key enters a sandbox), the run as it
// goes then its results (`agent-config-eval-run.tsx`), and the configuration's past runs. Nothing
// shows while the flag is off, or while the server cannot run tests (its routes answer 404).
import { Link } from '@tanstack/react-router'
import { FlaskConicalIcon } from 'lucide-react'
import * as React from 'react'

import { EvalRunView } from '@/agent-configs/agent-config-eval-run'
import { type EvalMessages, useEvalFormat, useRuleTitle } from '@/agent-configs/eval-format'
import { RunStatus } from '@/agent-configs/eval-run-status'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DescriptionList } from '@/components/ui/description-list'
import { RelativeTime } from '@/components/ui/relative-time'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import type { RulePack } from '@/lib/agent-configs'
import { TuyauError } from '@/lib/client'
import {
  activeRunId,
  type EvalBlocker,
  evalBlocker,
  type EvalPlan,
  isRunActive,
  isSubscriptionKind,
  isUnverifiedKind,
  startFailure,
} from '@/lib/convention-eval-results'
import { useEvalPlan, useEvalRun, useEvalRuns, useStartEval } from '@/lib/convention-evals'
import { useFeature } from '@/lib/feature-flags'
import { useCoreloomI18n } from '@/lib/i18n'
import { type StoredProvider, useStoredProvider } from '@/lib/llm-provider'
import { useT } from '@/lib/locale'

const isNotFound = (error: unknown) => error instanceof TuyauError && error.status === 404

const HEADING_CLASS =
  'm-0 text-[15px] font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring'

/** The section, or nothing while the flag is off. */
export function AgentConfigEvals({ configId, packs }: { configId: number; packs: RulePack[] }) {
  const enabled = useFeature('convention-evals')
  if (!enabled) return null
  return <EvalsSection configId={configId} packs={packs} />
}

function EvalsSection({ configId, packs }: { configId: number; packs: RulePack[] }) {
  const t = useT().evals
  const [page, setPage] = React.useState(1)
  // `undefined` until the owner opens or closes a run: the run still going, if any, shows then.
  const [picked, setPicked] = React.useState<number | null | undefined>(undefined)
  // The run whose heading takes the focus: one the owner opened or started, never one shown alone.
  const [focusRun, setFocusRun] = React.useState<number | null>(null)
  const runs = useEvalRuns(configId, page)
  const going = activeRunId(runs.data?.data ?? [])
  // A run started before a reload comes back once, and stays shown when it ends.
  if (picked === undefined && going !== null) setPicked(going)
  const runId = picked ?? null
  const shown = useEvalRun(configId, runId)
  const running = going !== null || (shown.data !== undefined && isRunActive(shown.data.run.status))
  const historyRef = React.useRef<HTMLHeadingElement>(null)
  const open = (id: number) => {
    setPicked(id)
    setFocusRun(id)
  }

  // The server cannot run tests (no sandbox service): the section stays hidden.
  if (runs.isError && isNotFound(runs.error)) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConicalIcon aria-hidden className="size-4" />
          {t.title}
        </CardTitle>
        <CardDescription>{t.intro}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <EvalPlanBlock configId={configId} packs={packs} running={running} onStarted={open} />
        {runId !== null && (
          <EvalRunView
            configId={configId}
            runId={runId}
            packs={packs}
            takeFocus={focusRun === runId}
            onClose={() => {
              setPicked(null)
              historyRef.current?.focus()
            }}
          />
        )}
        <section className="flex flex-col gap-3" aria-labelledby="convention-evals-history">
          <h3
            id="convention-evals-history"
            ref={historyRef}
            tabIndex={-1}
            className={HEADING_CLASS}
          >
            {t.history}
          </h3>
          <EvalRunList runs={runs} selected={runId} onOpen={open} onPage={setPage} />
        </section>
        <p className="m-0 text-[13px] text-muted-foreground">{t.caveat}</p>
      </CardContent>
    </Card>
  )
}

/** Why a test cannot start, in words, and whether the settings can fix it. */
function blockerText(
  t: EvalMessages,
  blocker: EvalBlocker,
  testable: string,
): { text: string; settings: boolean } {
  if (blocker.kind === 'no-provider') return { text: t.noProvider, settings: true }
  if (blocker.kind === 'provider-unavailable')
    return { text: t.providerUnavailable, settings: true }
  if (blocker.kind === 'busy') return { text: t.busy, settings: false }
  switch (blocker.refusal) {
    case 'no_testable_rule':
      return { text: t.refusal.no_testable_rule(testable), settings: false }
    case 'over_cap':
      return { text: t.refusal.over_cap, settings: false }
    default:
      return { text: t.refusal[blocker.refusal], settings: true }
  }
}

function BlockerNotice({
  id,
  blocker,
  plan,
  packs,
}: {
  id: string
  blocker: EvalBlocker
  plan: EvalPlan | undefined
  packs: RulePack[]
}) {
  const t = useT().evals
  const ruleTitle = useRuleTitle(packs)
  const { text, settings } = blockerText(
    t,
    blocker,
    (plan?.testable ?? []).map(ruleTitle).join(', '),
  )
  return (
    <Alert variant={blocker.kind === 'busy' ? 'default' : 'warning'}>
      <AlertDescription className="flex flex-col gap-2">
        <span id={id}>{text}</span>
        {settings && (
          <Button variant="outline" size="sm" className="w-fit" asChild>
            <Link to="/settings">{t.openSettings}</Link>
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

function EvalPlanBlock({
  configId,
  packs,
  running,
  onStarted,
}: {
  configId: number
  packs: RulePack[]
  running: boolean
  onStarted: (runId: number) => void
}) {
  const t = useT().evals
  const provider = useStoredProvider()
  const plan = useEvalPlan(configId, provider)

  if (provider && plan.isPending)
    return (
      <div className="flex flex-col gap-2" role="status">
        <span className="text-[13px] text-muted-foreground">{t.loading}</span>
        <Skeleton className="h-32 w-full" />
      </div>
    )
  if (plan.isError && !isNotFound(plan.error))
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.planFailed}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void plan.refetch()}>
            {t.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )
  return (
    <PlanReady
      configId={configId}
      packs={packs}
      provider={provider}
      plan={plan.data}
      blocker={evalBlocker(provider, plan.data ?? null, plan.isError, running)}
      onStarted={onStarted}
    />
  )
}

/** The plan as it stands: what would run, why it cannot, and the button that starts it. */
function PlanReady({
  configId,
  packs,
  provider,
  plan,
  blocker,
  onStarted,
}: {
  configId: number
  packs: RulePack[]
  provider: StoredProvider | null
  plan: EvalPlan | undefined
  blocker: EvalBlocker | null
  onStarted: (runId: number) => void
}) {
  const t = useT().evals
  const [confirming, setConfirming] = React.useState(false)
  const blockerId = React.useId()
  const ready = plan && provider && !blocker ? { plan, provider } : null
  return (
    <div className="flex flex-col gap-4">
      {plan && provider && <PlanDetails plan={plan} provider={provider} packs={packs} />}
      {blocker && <BlockerNotice id={blockerId} blocker={blocker} plan={plan} packs={packs} />}
      {ready && isUnverifiedKind(ready.provider.kind) && (
        <Alert variant="warning">
          <AlertDescription>{t.unverified}</AlertDescription>
        </Alert>
      )}
      <Button
        className="w-fit"
        disabled={!ready}
        aria-describedby={blocker ? blockerId : undefined}
        onClick={() => {
          setConfirming(true)
        }}
      >
        <FlaskConicalIcon /> {t.start}
      </Button>
      {ready && (
        <ConfirmStart
          configId={configId}
          open={confirming}
          onOpenChange={setConfirming}
          plan={ready.plan}
          provider={ready.provider}
          onStarted={onStarted}
        />
      )}
    </div>
  )
}

function costRange(t: EvalMessages, usd: (value: number) => string, plan: EvalPlan) {
  return plan.estimate
    ? t.estimateRange(usd(plan.estimate.lowUsd), usd(plan.estimate.highUsd))
    : null
}

function PlanDetails({
  plan,
  provider,
  packs,
}: {
  plan: EvalPlan
  provider: StoredProvider
  packs: RulePack[]
}) {
  const t = useT().evals
  const format = useEvalFormat()
  const ruleTitle = useRuleTitle(packs)
  const range = costRange(t, format.usd, plan)
  return (
    <DescriptionList
      layout="inline"
      items={[
        {
          term: t.agent,
          value: (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{t.agentLabel[plan.agent]}</span>
              <Badge variant="outline">{provider.model}</Badge>
            </span>
          ),
          hint: plan.path === 'cli' ? t.pathCli : t.pathHarness,
        },
        {
          term: t.rules,
          value:
            plan.rules.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {plan.rules.map((rule) => (
                  <li key={`${rule.slot}:${rule.rule}`}>{ruleTitle(rule)}</li>
                ))}
              </ul>
            ) : (
              t.noRules
            ),
        },
        {
          term: t.trials,
          value: t.trialsText(
            plan.trials,
            plan.tasks.length,
            plan.conditions.length,
            plan.attempts,
          ),
        },
        {
          term: t.estimate,
          value: range ?? t.estimateNone,
          hint: (
            <>
              {t.pricesCheckedOn(format.day(plan.pricesCheckedOn))}
              {isSubscriptionKind(provider.kind) && ` ${t.subscriptionCost}`}
            </>
          ),
        },
        {
          term: t.cap,
          value: plan.estimate
            ? t.capUsd(format.usd(plan.capUsd))
            : t.capTokens(format.integer(plan.maxTokens)),
        },
      ]}
    />
  )
}

/** Why the API refused to start the test, in words. */
function startFailureText(t: EvalMessages, error: unknown): string {
  const failure =
    error instanceof TuyauError
      ? startFailure(error.status, error.response)
      : startFailure(undefined, null)
  if (failure.kind === 'busy') return t.busy
  // The plan said which rules are testable already: a start refused for it reads as a failure.
  if (failure.kind === 'refused' && failure.refusal && failure.refusal !== 'no_testable_rule')
    return t.refusal[failure.refusal]
  return t.startFailed
}

function ConfirmStart({
  configId,
  open,
  onOpenChange,
  plan,
  provider,
  onStarted,
}: {
  configId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: EvalPlan
  provider: StoredProvider
  onStarted: (runId: number) => void
}) {
  const t = useT().evals
  const format = useEvalFormat()
  const start = useStartEval(configId)
  const range = costRange(t, format.usd, plan)
  const cost = range
    ? t.confirmCost(range, format.usd(plan.capUsd))
    : t.confirmTokens(format.integer(plan.maxTokens))

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (start.isPending) return
        if (!next) start.reset()
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.confirmTitle}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">
              <p className="m-0">
                {cost}
                {isSubscriptionKind(provider.kind) && ` ${t.subscriptionCost}`}
              </p>
              <p className="m-0">{plan.path === 'cli' ? t.confirmKey : t.confirmHarness}</p>
              <p className="m-0">{t.confirmDuration}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {start.isError && (
          <Alert variant="destructive">
            <AlertDescription>{startFailureText(t, start.error)}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={start.isPending}>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={start.isPending}
            aria-busy={start.isPending || undefined}
            onClick={(event) => {
              // The dialog stays open until the API answers, to say why it refused.
              event.preventDefault()
              start.mutate(provider, {
                onSuccess: ({ runId }) => {
                  toast.success(t.started)
                  onOpenChange(false)
                  start.reset()
                  onStarted(runId)
                },
              })
            }}
          >
            {start.isPending && <Spinner />}
            {t.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function EvalRunList({
  runs,
  selected,
  onOpen,
  onPage,
}: {
  runs: ReturnType<typeof useEvalRuns>
  selected: number | null
  onOpen: (runId: number) => void
  onPage: (page: number) => void
}) {
  const t = useT().evals
  const pagination = useCoreloomI18n().messages.pagination
  const format = useEvalFormat()

  if (runs.isPending) return <Skeleton className="h-20 w-full" />
  if (runs.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.historyFailed}</AlertTitle>
        <AlertDescription>
          <Button variant="outline" size="sm" onClick={() => void runs.refetch()}>
            {t.retry}
          </Button>
        </AlertDescription>
      </Alert>
    )
  const { data, meta } = runs.data
  if (data.length === 0)
    return <p className="m-0 text-[13px] text-muted-foreground">{t.historyEmpty}</p>
  return (
    <div className="flex flex-col gap-3">
      <ul className="m-0 flex list-none flex-col divide-y divide-border-subtle p-0">
        {data.map((run) => (
          <li key={run.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <RunStatus status={run.status} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[14px]">{t.agentLabel[run.agent]}</span>
              <span className="text-[12.5px] text-muted-foreground">
                <RelativeTime date={run.createdAt} /> · {run.model}
                {run.costUsd !== null && ` · ${format.usd(run.costUsd)}`}
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={selected === run.id}
              aria-label={t.openRun(t.runTitle(format.dateTime(run.createdAt)))}
              onClick={() => {
                onOpen(run.id)
              }}
            >
              {selected === run.id ? t.opened : t.open}
            </Button>
          </li>
        ))}
      </ul>
      {meta.lastPage > 1 && (
        <nav aria-label={pagination.label} className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={meta.page <= 1}
            onClick={() => {
              onPage(meta.page - 1)
            }}
          >
            {pagination.previous}
          </Button>
          <span className="text-[13px] text-muted-foreground">
            {t.page(meta.page, meta.lastPage)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={meta.page >= meta.lastPage}
            onClick={() => {
              onPage(meta.page + 1)
            }}
          >
            {pagination.next}
          </Button>
        </nav>
      )}
    </div>
  )
}
