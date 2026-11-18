// The review of what the model proposed from a conventions file or a web research: the pages read,
// the ready-made rules to hold (added together) and the rules of the owner's own (accepted one by
// one). Shared by the import panel and by the assistant's messages that carry proposals; nothing is
// stored before the owner adds a rule.
import { CheckIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { ProposalsReview } from '@/agent-configs/agent-config-proposals'
import {
  type Groups,
  type ImportResult,
  readyKey,
  withProposed,
} from '@/agent-configs/import-rules'
import { AppliedBadge, RuleText } from '@/agent-configs/rule-text'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { toast } from '@/components/ui/sonner'
import { Spinner } from '@/components/ui/spinner'
import { type AgentConfig, useSaveReadyRules } from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import {
  type ImportedReadyRule,
  type ResearchSource,
  type ResearchStep,
  useResearchProgress,
} from '@/lib/llm-provider'
import { useLocale, useT } from '@/lib/locale'
import { type Choice, fillValue, heldBySlot } from '@/lib/ready-rules'

/** What the model proposed: the pages it read, the ready-made rules, then the other rules. */
export function ImportReview({
  configId,
  config,
  groups,
  result,
  checked,
  onCheckedChange,
  onResultChange,
  onAdded,
}: {
  configId: number
  config: AgentConfig
  groups: Groups
  result: ImportResult
  checked: Set<string>
  onCheckedChange: (checked: Set<string>) => void
  onResultChange: React.Dispatch<React.SetStateAction<ImportResult | null>>
  /** Rules were stored in the configuration: how many. */
  onAdded?: (count: number) => void
}) {
  const t = useT()
  const rulesId = React.useId()
  return (
    <>
      {result.sources && <ResearchSources sources={result.sources} />}
      {result.truncated && (
        <Alert>
          <AlertDescription>{t.llm.importTruncated}</AlertDescription>
        </Alert>
      )}
      <ImportedReadyRules
        configId={configId}
        config={config}
        groups={groups}
        ready={result.ready}
        checked={checked}
        onCheckedChange={onCheckedChange}
        onApplied={(keys) => {
          onResultChange((left) =>
            left
              ? { ...left, ready: left.ready.filter((item) => !keys.has(readyKey(item))) }
              : left,
          )
          if (keys.size > 0) onAdded?.(keys.size)
        }}
      />
      <section aria-labelledby={rulesId} className="flex flex-col gap-3">
        <h3 id={rulesId} className="text-sm font-medium">
          {t.llm.importRules}
        </h3>
        <ProposalsReview
          configId={configId}
          config={config}
          proposals={result.rules}
          truncated={false}
          skipped={[]}
          empty={t.llm.importNoRules}
          onAccepted={() => onAdded?.(1)}
          onHandled={(id) => {
            onResultChange((left) =>
              left ? { ...left, rules: left.rules.filter((rule) => rule.id !== id) } : left,
            )
          }}
        />
      </section>
    </>
  )
}

/** What the model has done in the sandbox so far, while the research runs. */
export function ResearchSteps({ configId }: { configId: number }) {
  const t = useT()
  const steps = useResearchProgress(configId, true).data ?? []
  if (steps.length === 0) return null
  return (
    <ol aria-label={t.llm.researchSteps} className="flex flex-col gap-1 text-sm">
      {steps.map((step) => (
        <li key={step.position} className="flex min-w-0 items-start gap-2">
          <ResearchStepState state={step.state} />
          <span className="min-w-0 break-all">
            <span className="text-muted-foreground">{t.llm.researchStepKind[step.kind]}</span>{' '}
            {step.kind === 'command' ? <code>{step.label}</code> : step.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

function ResearchStepState({ state }: { state: ResearchStep['state'] }) {
  const t = useT()
  const label = t.llm.researchStepState[state]
  const icon = {
    running: <Spinner />,
    done: <CheckIcon aria-hidden className="size-4" />,
    failed: <XIcon aria-hidden className="size-4 text-destructive" />,
  }[state]
  return (
    <span className="mt-0.5 shrink-0">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** The pages a web research read, so the owner can check where each proposal comes from. */
export function ResearchSources({ sources }: { sources: ResearchSource[] }) {
  const t = useT()
  const headingId = React.useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-sm font-medium">
        {t.llm.researchSources}
      </h3>
      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.llm.researchNoSources}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {sources.map((source) => (
            <li key={source.url} className="min-w-0">
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="break-all text-primary-text underline underline-offset-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                {source.title ?? source.url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The proposed ready-made rules, each with the words it comes from. The checked ones are added
 * group by group, next to what a group already holds when it can hold several.
 */
function ImportedReadyRules({
  configId,
  config,
  groups,
  ready,
  checked,
  onCheckedChange,
  onApplied,
}: {
  configId: number
  config: AgentConfig
  groups: Groups
  ready: ImportedReadyRule[]
  checked: Set<string>
  onCheckedChange: (checked: Set<string>) => void
  onApplied: (keys: Set<string>) => void
}) {
  const t = useT()
  const { locale } = useLocale()
  // Several reviews can be on one screen (one per message of a conversation): ids of their own.
  const baseId = React.useId()
  const save = useSaveReadyRules(configId)
  const [applying, setApplying] = React.useState(false)
  const held = heldBySlot(config.readyRules)

  const rows = ready.flatMap((item) => {
    const group = groups.get(item.slot)
    const rule = group?.rules.find((candidate) => candidate.id === item.rule)
    if (!group || !rule) return []
    const current = held.get(item.slot) ?? []
    const kept = withProposed(group, current, item)
    const replaced = group.rules.filter(
      (candidate) =>
        current.some((choice) => choice.rule === candidate.id) &&
        !kept.some((choice) => choice.rule === candidate.id),
    )
    return [{ item, group, rule, replaced }]
  })
  const picked = rows.filter(({ item }) => checked.has(readyKey(item)))

  const apply = async () => {
    setApplying(true)
    const applied = new Set<string>()
    try {
      for (const slot of new Set(picked.map(({ item }) => item.slot))) {
        const mine = picked.filter(({ item }) => item.slot === slot)
        const group = mine.at(0)?.group
        if (!group) continue
        const rules = mine.reduce<Choice[]>(
          (kept, { item }) => withProposed(group, kept, item),
          held.get(slot) ?? [],
        )
        await save.mutateAsync({ slot, rules })
        // Only the rules that made it: a later one of the group can push an earlier one out.
        for (const { item } of mine) {
          if (rules.some((choice) => choice.rule === item.rule)) applied.add(readyKey(item))
        }
      }
      toast.success(t.llm.importApplied)
    } catch (error) {
      toast.error(getErrorMessage(error, t.llm.failed))
    } finally {
      setApplying(false)
      onApplied(applied)
    }
  }

  return (
    <section aria-labelledby={baseId} className="flex flex-col gap-3">
      <h3 id={baseId} className="text-sm font-medium">
        {t.llm.importReady}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.llm.importNoReady}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t.llm.importReadyHint}</p>
          {rows.map(({ item, group, rule, replaced }) => {
            const key = readyKey(item)
            const id = `${baseId}-${key}`
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
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[13px] text-muted-foreground">
                    <RuleText text={group.label[locale]} />
                  </span>
                  <span className="flex flex-wrap items-start gap-x-2 gap-y-1">
                    <FieldLabel htmlFor={id} className="inline leading-[1.45] text-foreground">
                      <RuleText text={fillValue(rule.title[locale], rule, item.value)} />
                    </FieldLabel>
                    {rule.applied && <AppliedBadge />}
                  </span>
                  {rule.input && item.value && (
                    <span className="text-sm">{t.llm.importValue(item.value)}</span>
                  )}
                  {replaced.length > 0 && (
                    <FieldDescription>
                      {t.llm.importReplaces(
                        replaced.map((other) => other.title[locale]).join(', '),
                      )}
                    </FieldDescription>
                  )}
                  {item.evidence && (
                    <blockquote className="border-l-2 pl-2 text-xs text-muted-foreground">
                      {item.evidence}
                    </blockquote>
                  )}
                </div>
              </Field>
            )
          })}
          <Button
            className="self-start"
            disabled={picked.length === 0 || applying}
            onClick={() => void apply()}
          >
            {t.llm.importApply(picked.length)}
          </Button>
        </>
      )}
    </section>
  )
}
