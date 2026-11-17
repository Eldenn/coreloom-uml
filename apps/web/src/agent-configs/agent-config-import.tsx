// Import: the user's own model reads a conventions file pasted here and proposes ready-made rules
// to hold (added together; one that would replace a rule already held starts unchecked) and rules
// of the owner's own (accepted one by one, as proposals). Nothing is stored before that.
import { FileInputIcon } from 'lucide-react'
import * as React from 'react'

import { ProposalsFailed, ProposalsReview } from '@/agent-configs/agent-config-proposals'
import { AppliedBadge, RuleText } from '@/agent-configs/rule-text'
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
import { type AgentConfig, type RulePack, useSaveReadyRules } from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import { type ImportedReadyRule, useImportAgentFile, useStoredProvider } from '@/lib/llm-provider'
import { useLocale, useT } from '@/lib/locale'
import { type Choice, chooseRule, fillValue, heldBySlot } from '@/lib/ready-rules'

/** `slot/rule`, the key of a proposed ready-made rule. */
const readyKey = (item: { slot: string; rule: string }) => `${item.slot}/${item.rule}`

interface Result {
  ready: ImportedReadyRule[]
  rules: { id: string; section: string; text: string; basedOn: null }[]
  truncated: boolean
}

/** The rules a group holds once a proposed one is added to them. */
function withProposed(
  group: RulePack['groups'][number],
  held: readonly Choice[],
  item: ImportedReadyRule,
) {
  return chooseRule(group, held, { rule: item.rule, chosen: true, value: item.value ?? '' })
}

/** "Import a file" and its panel; nothing at all while no provider is set in this browser. */
export function AgentFileImport({
  configId,
  config,
  packs,
}: {
  configId: number
  config: AgentConfig
  packs: RulePack[]
}) {
  const t = useT()
  const provider = useStoredProvider()
  const [open, setOpen] = React.useState(false)
  const [content, setContent] = React.useState('')
  const [result, setResult] = React.useState<Result | null>(null)
  const [checked, setChecked] = React.useState<Set<string>>(() => new Set())
  const read = useImportAgentFile(configId)
  const groups = React.useMemo(
    () => new Map(packs.flatMap((pack) => pack.groups).map((group) => [group.slot, group])),
    [packs],
  )

  if (!provider) return null

  const run = () => {
    read.mutate(
      { provider, content },
      {
        onSuccess: (body) => {
          const held = heldBySlot(config.readyRules)
          // One that would push out a rule already held is left for the owner to check.
          const safe = body.ready.filter((item) => {
            const group = groups.get(item.slot)
            const current = held.get(item.slot) ?? []
            return group && withProposed(group, current, item).length > current.length
          })
          setChecked(new Set(safe.map(readyKey)))
          setResult({
            ready: body.ready,
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
                <ImportedReadyRules
                  configId={configId}
                  config={config}
                  groups={groups}
                  ready={result.ready}
                  checked={checked}
                  onCheckedChange={setChecked}
                  onApplied={(keys) => {
                    setResult((left) =>
                      left
                        ? { ...left, ready: left.ready.filter((item) => !keys.has(readyKey(item))) }
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
  groups: Map<string, RulePack['groups'][number]>
  ready: ImportedReadyRule[]
  checked: Set<string>
  onCheckedChange: (checked: Set<string>) => void
  onApplied: (keys: Set<string>) => void
}) {
  const t = useT()
  const { locale } = useLocale()
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
    <section aria-labelledby="agent-import-ready" className="flex flex-col gap-3">
      <h3 id="agent-import-ready" className="text-sm font-medium">
        {t.llm.importReady}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.llm.importNoReady}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t.llm.importReadyHint}</p>
          {rows.map(({ item, group, rule, replaced }) => {
            const key = readyKey(item)
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
