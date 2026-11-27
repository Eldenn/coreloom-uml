// One convention test: its status while it goes (asked again every few seconds), then what it
// measured, what it cost, how long it took, and its results per rule and condition as "held n/k",
// the task and the rule apart. A test stopped by the cap, failed or whose output held a secret
// says so, and a leak on a saved key asks for that key to be rotated.
import * as React from 'react'

import {
  type EvalMessages,
  failureText,
  useEvalFormat,
  useRuleTitle,
} from '@/agent-configs/eval-format'
import { RunStatus } from '@/agent-configs/eval-run-status'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DescriptionList } from '@/components/ui/description-list'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { RulePack } from '@/lib/agent-configs'
import {
  type ConditionResult,
  type EvalRun,
  type EvalTrial,
  type HeldCount,
  isRunActive,
  isSubscriptionKind,
  ruleResults,
  runDurationMs,
  totalTokens,
} from '@/lib/convention-eval-results'
import { useEvalRun } from '@/lib/convention-evals'
import { useT } from '@/lib/locale'

const HEADING_CLASS =
  'm-0 text-[15px] font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring'

/** The end of a run that did not finish normally: why, and what to do about a leak. */
function RunEnding({ run }: { run: EvalRun }) {
  const t = useT().evals
  if (run.status === 'leaked')
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.leakedTitle}</AlertTitle>
        <AlertDescription>
          {t.leakedText} {run.path === 'cli' && t.leakedRotate}
        </AlertDescription>
      </Alert>
    )
  if (run.status === 'cancelled')
    return (
      <Alert variant="warning">
        <AlertTitle>{t.cancelledTitle}</AlertTitle>
        <AlertDescription>{failureText(t, run.failureReason)}</AlertDescription>
      </Alert>
    )
  if (run.status === 'failed')
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.failedTitle}</AlertTitle>
        <AlertDescription>{failureText(t, run.failureReason)}</AlertDescription>
      </Alert>
    )
  return null
}

function runFacts(
  t: EvalMessages,
  format: ReturnType<typeof useEvalFormat>,
  run: EvalRun,
  durationMs: number | null,
) {
  const { tokens } = run
  return [
    {
      term: t.agent,
      value: t.agentLabel[run.agent],
      hint: run.path === 'cli' ? t.pathCli : t.pathHarness,
    },
    { term: t.model, value: run.model, hint: t.revision(run.configRevision, run.catalogVersion) },
    {
      term: isSubscriptionKind(run.providerKind) ? t.equivalentCost : t.measuredCost,
      value: run.costUsd === null ? t.noCost : format.usd(run.costUsd),
      hint: run.estimate
        ? `${t.estimate}: ${t.estimateRange(format.usd(run.estimate.lowUsd), format.usd(run.estimate.highUsd))} · ${t.cap}: ${format.usd(run.capUsd)}`
        : undefined,
    },
    {
      term: t.tokens,
      value: t.tokensText({
        total: format.integer(totalTokens(tokens)),
        input: format.integer(tokens.input),
        cached: format.integer(tokens.cachedInput),
        written: format.integer(tokens.cacheWrite),
        output: format.integer(tokens.output),
      }),
    },
    { term: t.duration, value: durationMs === null ? t.notStarted : format.duration(durationMs) },
  ]
}

export function EvalRunView({
  configId,
  runId,
  packs,
  onClose,
}: {
  configId: number
  runId: number
  packs: RulePack[]
  onClose: () => void
}) {
  const t = useT().evals
  const format = useEvalFormat()
  const detail = useEvalRun(configId, runId)
  // A run opened from the list (or just started) takes the focus once its heading shows.
  const focusedFor = React.useRef<number | null>(null)
  const headingRef = (node: HTMLHeadingElement | null) => {
    if (!node || focusedFor.current === runId) return
    focusedFor.current = runId
    node.focus()
  }

  if (detail.isPending) return <Skeleton className="h-40 w-full" />
  if (detail.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>{t.runLoadFailed}</AlertTitle>
        <AlertDescription className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
            {t.retry}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t.close}
          </Button>
        </AlertDescription>
      </Alert>
    )

  const { run, trials } = detail.data
  // While it runs, the duration is counted to the last answer, which comes every few seconds.
  const durationMs = runDurationMs(run, detail.dataUpdatedAt)
  return (
    <section
      aria-labelledby="convention-eval-run"
      className="flex flex-col gap-4 rounded-md border border-border bg-background p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="convention-eval-run" ref={headingRef} tabIndex={-1} className={HEADING_CLASS}>
          {t.runTitle(format.dateTime(run.createdAt))}
        </h3>
        <div className="flex items-center gap-2">
          <span aria-live="polite">
            <RunStatus status={run.status} />
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t.close}
          </Button>
        </div>
      </div>
      {isRunActive(run.status) && (
        <div className="flex flex-col gap-1.5">
          <Progress
            value={run.trialCount > 0 ? (trials.length / run.trialCount) * 100 : 0}
            aria-label={t.progress(trials.length, run.trialCount)}
          />
          <span className="text-[13px] text-muted-foreground">
            {t.progress(trials.length, run.trialCount)}
          </span>
        </div>
      )}
      <RunEnding run={run} />
      <DescriptionList layout="grid" columns={2} items={runFacts(t, format, run, durationMs)} />
      <RunResults trials={trials} packs={packs} />
    </section>
  )
}

function HeldCell({ count }: { count: HeldCount }) {
  const t = useT().evals
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-mono text-[13px]">{t.held(count.held, count.graded)}</span>
      {count.notApplicable > 0 && (
        <span className="text-[12.5px] text-muted-foreground">
          {t.notApplicable(count.notApplicable)}
        </span>
      )}
    </span>
  )
}

function conditionName(t: EvalMessages, condition: string): string {
  return condition === 'none' || condition === 'full' ? t.conditionName[condition] : condition
}

function ConditionRow({
  result,
  leading,
}: {
  result: ConditionResult
  /** The rule and task cells, on the first row they span. */
  leading: React.ReactNode
}) {
  const t = useT().evals
  return (
    <TableRow>
      {leading}
      <TableCell>
        <span className="flex flex-col gap-0.5">
          {conditionName(t, result.condition)}
          {result.ungraded > 0 && (
            <span className="text-[12.5px] text-muted-foreground">
              {t.ungraded(result.ungraded)}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell>
        <HeldCell count={result.success} />
      </TableCell>
      <TableCell>
        <HeldCell count={result.compliance} />
      </TableCell>
    </TableRow>
  )
}

/** "held n/k" per rule and condition, the task and the rule apart: never one verdict. */
function RunResults({ trials, packs }: { trials: readonly EvalTrial[]; packs: RulePack[] }) {
  const t = useT().evals
  const ruleTitle = useRuleTitle(packs)
  const results = ruleResults(trials)
  return (
    <div className="flex flex-col gap-2">
      <h4 className="m-0 text-[14px] font-semibold">{t.results}</h4>
      <p className="m-0 text-[13px] text-muted-foreground">{t.resultsHint}</p>
      {results.length === 0 ? (
        <p className="m-0 text-[13px] text-muted-foreground">{t.noResults}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.rule}</TableHead>
              <TableHead>{t.task}</TableHead>
              <TableHead>{t.condition}</TableHead>
              <TableHead>{t.success}</TableHead>
              <TableHead>{t.compliance}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.flatMap((rule) => {
              const ruleRows = rule.tasks.reduce((sum, task) => sum + task.conditions.length, 0)
              return rule.tasks.flatMap((task, taskIndex) =>
                task.conditions.map((result, index) => (
                  <ConditionRow
                    key={`${rule.slot}:${rule.rule}:${task.taskId}:${result.condition}`}
                    result={result}
                    leading={
                      index === 0 && (
                        <>
                          {taskIndex === 0 && (
                            <TableCell rowSpan={ruleRows} className="align-top">
                              {ruleTitle(rule)}
                            </TableCell>
                          )}
                          <TableCell
                            rowSpan={task.conditions.length}
                            className="align-top font-mono text-[12.5px]"
                          >
                            {task.taskId}
                          </TableCell>
                        </>
                      )
                    }
                  />
                )),
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
