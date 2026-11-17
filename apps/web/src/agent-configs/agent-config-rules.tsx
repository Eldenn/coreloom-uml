// Rules: everything AGENTS.md says. The ready-made rules the configuration holds, section by
// section (removed or given their text here, chosen in the catalog), then the owner's own rules:
// lines written by hand or accepted from a model's proposals, ordered, edited and deleted one by one.
import {
  BookOpenCheckIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import { AgentFileImport } from '@/agent-configs/agent-config-import'
import { RuleProposals } from '@/agent-configs/agent-config-proposals'
import { AppliedBadge, RuleText } from '@/agent-configs/rule-text'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EditableText } from '@/components/ui/editable-text'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { useAppForm } from '@/components/ui/form'
import { toast } from '@/components/ui/sonner'
import { SortableList } from '@/components/ui/sortable-list'
import {
  type AgentConfig,
  type AgentRule,
  type ReadyRule,
  RULE_TEXT_MAX_LENGTH,
  type RuleGroup,
  type RulePack,
  RULES_MAX,
  useCreateRule,
  useDeleteRule,
  useSaveReadyRules,
  useUpdateRule,
} from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import { useLocale, useT } from '@/lib/locale'
import {
  type Choice,
  extraLines,
  fillValue,
  groupLines,
  heldBySlot,
  isApplied,
  plainText,
  RULE_VALUE_MAX_LENGTH,
} from '@/lib/ready-rules'

/** What the rule dialog opens with: a rule to edit, or the fields of a new one. */
type RuleDraft = { rule: AgentRule } | { section: string; text: string }

/** The rule that moved between two orders of the same ids, and where it went. */
function movedRule(before: string[], after: string[]): { id: string; position: number } | null {
  const first = before.findIndex((id, index) => after[index] !== id)
  if (first < 0) return null
  const last = before.findLastIndex((id, index) => after[index] !== id)
  const forward = before.at(first) === after.at(last)
  const id = forward ? before.at(first) : before.at(last)
  return id === undefined ? null : { id, position: forward ? last : first }
}

const overline =
  'm-0 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase'

export function AgentConfigRules({
  configId,
  config,
  packs,
  onBrowse,
}: {
  configId: number
  config: AgentConfig
  packs: RulePack[]
  /** Opens the catalog, on one group when its slot is given. */
  onBrowse: (slot?: string) => void
}) {
  const t = useT()
  const [draft, setDraft] = React.useState<RuleDraft | null>(null)
  const browseRef = React.useRef<HTMLButtonElement>(null)
  const full = config.rules.length >= RULES_MAX

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.agents.rulesTitle}</CardTitle>
        <CardDescription>{t.agents.rulesHint}</CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-2 max-sm:col-span-2 max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-3 max-sm:justify-start">
          <Button
            ref={browseRef}
            variant="secondary"
            size="sm"
            onClick={() => {
              onBrowse()
            }}
          >
            <BookOpenCheckIcon /> {t.agents.ready.browse}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={full}
            onClick={() => {
              setDraft({
                // `Project` holds the project's context; a new rule rarely belongs there.
                section:
                  config.ruleSections.find((section) => section !== 'Project') ??
                  config.ruleSections.at(0) ??
                  '',
                text: '',
              })
            }}
          >
            <PlusIcon /> {t.agents.addRule}
          </Button>
          <RuleProposals configId={configId} config={config} />
          <AgentFileImport configId={configId} config={config} packs={packs} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <ReadyRules
          configId={configId}
          config={config}
          packs={packs}
          onBrowse={onBrowse}
          onRemoved={() => browseRef.current?.focus()}
        />
        <OwnRules
          configId={configId}
          config={config}
          onEdit={(rule) => {
            setDraft({ rule })
          }}
          onDeleted={() => browseRef.current?.focus()}
        />
      </CardContent>
      <RuleDialog
        configId={configId}
        sections={config.ruleSections}
        draft={draft}
        onClose={() => {
          setDraft(null)
        }}
      />
    </Card>
  )
}

/** The ready-made rules held, under their sections in the order AGENTS.md writes them. */
function ReadyRules({
  configId,
  config,
  packs,
  onBrowse,
  onRemoved,
}: {
  configId: number
  config: AgentConfig
  packs: RulePack[]
  onBrowse: (slot?: string) => void
  onRemoved: () => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const held = heldBySlot(config.readyRules)
  const groups = packs.flatMap((pack) => pack.groups)

  if (config.readyRules.length === 0) {
    const ruleCount = groups.reduce((count, group) => count + group.rules.length, 0)
    return (
      <Empty className="border border-dashed border-border py-8 md:p-8">
        <EmptyHeader className="max-w-lg">
          <EmptyMedia variant="icon">
            <BookOpenCheckIcon aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t.agents.ready.emptyTitle}</EmptyTitle>
          <EmptyDescription>{t.agents.ready.emptyText(ruleCount)}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-lg">
          <ul
            aria-label={t.agents.ready.startWith}
            className="m-0 flex w-full list-none flex-col divide-y divide-border-subtle overflow-hidden rounded-md border border-border p-0 text-left text-wrap"
          >
            {groups.filter(isApplied).map((group) => (
              <li key={group.slot}>
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-[13.5px] text-fg-secondary outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring"
                  onClick={() => {
                    onBrowse(group.slot)
                  }}
                >
                  <span className="min-w-0">
                    <RuleText text={group.label[locale].replace(/\s*:$/, '')} />
                  </span>
                  <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            onClick={() => {
              onBrowse()
            }}
          >
            <BookOpenCheckIcon /> {t.agents.ready.browse}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const sections = config.ruleSections
    .map((section) => ({
      section,
      groups: groups.filter((group) => group.section === section && held.has(group.slot)),
    }))
    .filter((item) => item.groups.length > 0)

  return (
    <section aria-labelledby="agent-ready-rules-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="agent-ready-rules-title" className="m-0 text-[15px] font-semibold text-foreground">
          {t.agents.ready.title}
        </h2>
        <p className="m-0 text-[13px] text-muted-foreground">
          {t.agents.ready.count(config.readyRules.length)}
        </p>
      </div>
      {sections.map(({ section, groups: sectionGroups }) => (
        <div key={section} className="flex flex-col gap-1">
          <h3 className={overline}>{section}</h3>
          <ul className="m-0 flex list-none flex-col divide-y divide-border-subtle p-0">
            {sectionGroups.map((group) => (
              <HeldGroup
                key={group.slot}
                configId={configId}
                group={group}
                held={held.get(group.slot) ?? []}
                onBrowse={onBrowse}
                onRemoved={onRemoved}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

/** One group's held rules: what each writes, its text when it takes one, and how to drop it. */
function HeldGroup({
  configId,
  group,
  held,
  onBrowse,
  onRemoved,
}: {
  configId: number
  group: RuleGroup
  held: Choice[]
  onBrowse: (slot?: string) => void
  onRemoved: () => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const save = useSaveReadyRules(configId)
  const label = group.label[locale]

  const put = (rules: Choice[], done?: () => void) => {
    save.mutate(
      { slot: group.slot, rules },
      {
        onSuccess: done,
        onError: (error) => toast.error(getErrorMessage(error, t.agents.failed)),
      },
    )
  }

  const rows = group.rules.flatMap((rule) => {
    const choice = held.find((item) => item.rule === rule.id)
    return choice ? [{ rule, value: choice.value }] : []
  })

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 min-w-0 text-[13px] leading-[1.45] text-muted-foreground">
          <RuleText text={label} />
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="-my-1 shrink-0"
          aria-label={t.agents.ready.changeGroup(plainText(label))}
          onClick={() => {
            onBrowse(group.slot)
          }}
        >
          <PencilIcon /> {t.agents.ready.change}
        </Button>
      </div>
      {rows.map(({ rule, value }) => (
        <HeldRuleRow
          key={rule.id}
          rule={rule}
          value={value}
          onValueChange={(text) => {
            put(held.map((item) => (item.rule === rule.id ? { ...item, value: text } : item)))
          }}
          onRemove={() => {
            put(
              held.filter((item) => item.rule !== rule.id),
              () => {
                toast.success(t.agents.ready.removed)
              },
            )
            // Its row goes at once: the focus moves before it is lost.
            onRemoved()
          }}
        />
      ))}
      {groupLines(group, held).map((line) => (
        <p key={line} className="m-0 text-[13px] leading-normal text-muted-foreground">
          <RuleText text={line} />
        </p>
      ))}
    </li>
  )
}

function HeldRuleRow({
  rule,
  value,
  onValueChange,
  onRemove,
}: {
  rule: ReadyRule
  value: string | null
  onValueChange: (text: string) => void
  onRemove: () => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const title = fillValue(rule.title[locale], rule, value)
  return (
    <div className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <p className="m-0 min-w-0 text-[14px] leading-[1.45] text-foreground">
            <RuleText text={title} />
          </p>
          {rule.applied && <AppliedBadge explained />}
        </div>
        {extraLines(rule, locale).map((line) => (
          <p key={line} className="m-0 text-[13px] leading-[1.5] text-muted-foreground">
            <RuleText text={fillValue(line, rule, value)} />
          </p>
        ))}
        {rule.input && (
          <p className="m-0 flex min-w-0 items-baseline gap-2 text-[13px] text-muted-foreground">
            <span className="shrink-0">{t.agents.ready.valueLabel}</span>
            <EditableText
              className="font-mono text-[13px] [font-variant-ligatures:none]"
              inputClassName="font-mono text-[13px] [font-variant-ligatures:none]"
              value={value ?? ''}
              label={t.agents.ready.valueOf(plainText(rule.title[locale]))}
              required
              maxLength={RULE_VALUE_MAX_LENGTH}
              onValueChange={onValueChange}
            />
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        aria-label={t.agents.ready.removeRule(plainText(title))}
        onClick={onRemove}
      >
        <XIcon />
      </Button>
    </div>
  )
}

/** The owner's own rules, in the order they are written. */
function OwnRules({
  configId,
  config,
  onEdit,
  onDeleted,
}: {
  configId: number
  config: AgentConfig
  onEdit: (rule: AgentRule) => void
  onDeleted: () => void
}) {
  const t = useT()
  const update = useUpdateRule(configId)
  const remove = useDeleteRule(configId)
  // Shown while a move is saved, so the list does not jump back first.
  const [moving, setMoving] = React.useState<string[] | null>(null)
  const ids = config.rules.map((rule) => String(rule.id))
  const full = config.rules.length >= RULES_MAX

  const sourceLabel = (rule: AgentRule) =>
    rule.source === 'llm' ? t.agents.ruleSourceLlm : t.agents.ruleSourceManual

  const options = config.rules.map((rule) => ({
    value: String(rule.id),
    label: rule.text,
    description: `${rule.section} · ${sourceLabel(rule)}`,
    actions: (
      <>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`${t.agents.editRule}: ${rule.text}`}
          onClick={() => {
            onEdit(rule)
          }}
        >
          <PencilIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`${t.agents.remove}: ${rule.text}`}
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate(rule.id, {
              onSuccess: () => {
                toast.success(t.agents.ruleDeleted)
                onDeleted()
              },
              onError: (error) => toast.error(getErrorMessage(error, t.agents.failed)),
            })
          }}
        >
          <Trash2Icon />
        </Button>
      </>
    ),
  }))

  return (
    <section aria-labelledby="agent-own-rules-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="agent-own-rules-title" className="m-0 text-[15px] font-semibold text-foreground">
          {t.agents.ownTitle}
        </h2>
        <p className="m-0 text-[13px] text-muted-foreground">
          {full ? t.agents.rulesFull(RULES_MAX) : t.agents.ownHint(RULES_MAX)}
        </p>
      </div>
      {config.rules.length === 0 ? (
        <p className="m-0 rounded-md border border-dashed border-border px-4 py-5 text-center text-[14px] text-muted-foreground">
          {t.agents.ownEmpty}
        </p>
      ) : (
        <SortableList
          aria-labelledby="agent-own-rules-title"
          numbered={false}
          wrap
          disabled={update.isPending}
          options={options}
          value={moving ?? ids}
          onValueChange={(order) => {
            const moved = movedRule(ids, order)
            if (!moved) return
            setMoving(order)
            update.mutate(
              { ruleId: Number(moved.id), position: moved.position },
              {
                onError: (error) => toast.error(getErrorMessage(error, t.agents.failed)),
                onSettled: () => {
                  setMoving(null)
                },
              },
            )
          }}
        />
      )}
    </section>
  )
}

function RuleDialog({
  configId,
  sections,
  draft,
  onClose,
}: {
  configId: number
  sections: string[]
  draft: RuleDraft | null
  onClose: () => void
}) {
  const t = useT()
  return (
    <Dialog
      open={draft !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {draft && 'rule' in draft ? t.agents.editRule : t.agents.addRule}
          </DialogTitle>
          <DialogDescription>{t.agents.ruleTextHint}</DialogDescription>
        </DialogHeader>
        {draft && (
          <RuleForm configId={configId} sections={sections} draft={draft} onDone={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RuleForm({
  configId,
  sections,
  draft,
  onDone,
}: {
  configId: number
  sections: string[]
  draft: RuleDraft
  onDone: () => void
}) {
  const t = useT()
  const create = useCreateRule(configId)
  const update = useUpdateRule(configId)
  const rule = 'rule' in draft ? draft.rule : null
  const form = useAppForm({
    defaultValues: {
      section: rule?.section ?? ('section' in draft ? draft.section : ''),
      text: rule?.text ?? ('text' in draft ? draft.text : ''),
    },
    validators: {
      onSubmit: z.object({
        section: z.string().min(1, t.agents.ruleSectionRequired),
        text: z
          .string()
          .trim()
          .min(1, t.agents.ruleTextRequired)
          .max(RULE_TEXT_MAX_LENGTH, t.agents.textTooLong(RULE_TEXT_MAX_LENGTH)),
      }),
    },
    onSubmit: async ({ value }) => {
      const body = { section: value.section, text: value.text.trim() }
      try {
        if (rule) await update.mutateAsync({ ruleId: rule.id, ...body })
        else await create.mutateAsync(body)
        toast.success(t.agents.ruleSaved)
        onDone()
      } catch (error) {
        toast.error(getErrorMessage(error, t.agents.failed))
      }
    },
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppForm>
        <form.AppField name="section">
          {(field) => (
            <field.SelectField
              label={t.agents.ruleSection}
              options={sections.map((section) => ({ value: section, label: section }))}
            />
          )}
        </form.AppField>
        <form.AppField name="text">
          {(field) => (
            <field.TextareaField
              label={t.agents.ruleText}
              rows={3}
              maxCount={RULE_TEXT_MAX_LENGTH}
            />
          )}
        </form.AppField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t.agents.cancel}
          </Button>
          <form.SubmitButton>{t.agents.save}</form.SubmitButton>
        </DialogFooter>
      </form.AppForm>
    </form>
  )
}
