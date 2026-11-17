// One group of the catalog of ready-made rules: its label, and its rules as choices (radio buttons
// when it holds one of several, checkboxes otherwise). Each change saves the group at once; a rule
// that takes a text is saved once the text is typed.
import { CircleDotIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { AppliedBadge, RuleText } from '@/agent-configs/rule-text'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from '@/components/ui/sonner'
import { type ReadyRule, type RuleGroup, useSaveReadyRules } from '@/lib/agent-configs'
import { getErrorMessage } from '@/lib/client'
import { useLocale, useT } from '@/lib/locale'
import {
  CHECKS_SLOT,
  type Choice,
  chooseRule,
  extraLines,
  fillValue,
  groupDomId,
  groupLines,
  plainText,
  RULE_VALUE_MAX_LENGTH,
  sameChoices,
  waitingRule,
} from '@/lib/ready-rules'
import { cn } from '@/lib/utils'

/** How long after the last keystroke a typed text is saved; leaving the field saves at once. */
const TYPING_PAUSE_MS = 800

/**
 * What a group shows and how it changes. `draft` is what the screen shows before the
 * configuration does: a choice still waiting for its text, or one being saved.
 */
function useGroupChoices(configId: number, group: RuleGroup, held: readonly Choice[]) {
  const t = useT()
  const save = useSaveReadyRules(configId)
  const [draft, setDraft] = React.useState<Choice[] | null>(null)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  // The text of a rule that was unticked, given back if it is ticked again.
  const lastText = React.useRef(new Map<string, string>())
  const shown = draft ?? held
  const waiting = waitingRule(group, shown)

  React.useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )

  const commit = (next: Choice[]) => {
    clearTimeout(timer.current)
    timer.current = undefined
    if (waitingRule(group, next)) {
      setDraft(next)
      return
    }
    if (sameChoices(next, held)) {
      setDraft(null)
      return
    }
    setDraft(next)
    save.mutate(
      {
        slot: group.slot,
        rules: next.map(({ rule, value }) => ({ rule, value: value?.trim() ?? null })),
      },
      {
        onError: (error) => toast.error(getErrorMessage(error, t.agents.failed)),
        onSettled: () => {
          setDraft((current) => (current === next ? null : current))
        },
      },
    )
  }

  return {
    shown,
    waiting,
    /** Why the last change was refused, while nothing newer replaced it. */
    error: save.isError && !waiting ? getErrorMessage(save.error, '') : null,
    commit,
    choose: (rule: string, chosen: boolean) => {
      const current = shown.find((choice) => choice.rule === rule)?.value
      if (typeof current === 'string') lastText.current.set(rule, current)
      commit(chooseRule(group, shown, { rule, chosen, value: lastText.current.get(rule) }))
    },
    type: (rule: string, text: string) => {
      const next = shown.map((choice) =>
        choice.rule === rule ? { ...choice, value: text } : choice,
      )
      clearTimeout(timer.current)
      timer.current = undefined
      setDraft(next)
      if (!waitingRule(group, next)) {
        timer.current = setTimeout(() => {
          commit(next)
        }, TYPING_PAUSE_MS)
      }
    },
    /** The text field is left: what is typed is saved, and a held rule left blank gets its text back. */
    leave: (rule: ReadyRule) => {
      if (!draft) return
      if (waiting === rule && held.some((choice) => choice.rule === rule.id)) setDraft(null)
      else commit(draft)
    },
  }
}

interface GroupProps {
  configId: number
  group: RuleGroup
  held: readonly Choice[]
  /** The words of the search, marked in the texts. */
  terms: readonly string[]
  /** The group the address names. */
  linked: boolean
}

function GroupBlock({ configId, group, held, terms, linked }: GroupProps) {
  const t = useT()
  const { locale } = useLocale()
  const id = React.useId()
  const labelId = `${id}-label`
  const choices = useGroupChoices(configId, group, held)
  const { shown } = choices
  const controlsRef = React.useRef<HTMLDivElement>(null)
  // A text field opened with the pointer takes the focus; with the keyboard, Tab reaches it.
  const byPointer = React.useRef(false)
  // One rule to take or leave is a checkbox, even in a group that holds one.
  const exclusive = group.pick === 'one' && group.rules.length > 1
  const label = group.label[locale]

  const row = (rule: ReadyRule, control: RowProps['control']) => (
    <RuleRow
      key={rule.id}
      id={`${id}-${rule.id}`}
      group={group}
      rule={rule}
      choice={shown.find((choice) => choice.rule === rule.id)}
      terms={terms}
      waiting={choices.waiting === rule}
      focusValue={byPointer}
      control={control}
      onType={(text) => {
        choices.type(rule.id, text)
      }}
      onLeave={() => {
        choices.leave(rule)
      }}
    />
  )

  return (
    <div
      id={groupDomId(group.slot)}
      role="group"
      tabIndex={-1}
      aria-labelledby={labelId}
      className={cn(
        'flex scroll-mt-48 flex-col gap-3 rounded-md border border-border bg-card p-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
        linked && 'border-primary',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p id={labelId} className="m-0 text-[14px] leading-[1.45] font-medium text-foreground">
            <RuleText text={label} terms={terms} />
          </p>
          {group.help && (
            <p className="m-0 text-[13px] leading-normal text-muted-foreground">
              <RuleText text={group.help[locale]} terms={terms} />
            </p>
          )}
        </div>
        {exclusive && shown.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="-my-1 shrink-0"
            aria-label={t.agents.ready.clearGroup(plainText(label))}
            onClick={() => {
              choices.commit([])
              // The button goes away with the choice: the group's first rule takes the focus.
              requestAnimationFrame(() => controlsRef.current?.querySelector('button')?.focus())
            }}
          >
            <XIcon /> {t.agents.ready.clear}
          </Button>
        )}
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- only notes how a rule was chosen; the controls inside handle the keys and the clicks. */}
      <div
        ref={controlsRef}
        onPointerDown={() => {
          byPointer.current = true
        }}
        onKeyDown={() => {
          byPointer.current = false
        }}
      >
        {exclusive ? (
          <RadioGroup
            aria-labelledby={labelId}
            className="gap-3"
            value={shown.at(0)?.rule ?? ''}
            onValueChange={(rule) => {
              choices.choose(rule, true)
            }}
          >
            {group.rules.map((rule) =>
              row(rule, (ruleId, describedBy) => (
                <RadioGroupItem id={ruleId} value={rule.id} aria-describedby={describedBy} />
              )),
            )}
          </RadioGroup>
        ) : (
          <div className="grid gap-3">
            {group.rules.map((rule) =>
              row(rule, (ruleId, describedBy) => (
                <Checkbox
                  id={ruleId}
                  aria-describedby={describedBy}
                  checked={shown.some((choice) => choice.rule === rule.id)}
                  onCheckedChange={(checked) => {
                    choices.choose(rule.id, checked === true)
                  }}
                />
              )),
            )}
          </div>
        )}
      </div>
      {group.lines.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border-subtle pt-3 text-[12.5px] leading-normal text-muted-foreground">
          <p className="m-0">{t.agents.ready.alsoWritten}</p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            {groupLines(group, shown).map((line) => (
              <li key={line}>
                <RuleText text={line} terms={terms} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {choices.error !== null && (
        <p role="alert" className="m-0 text-[13px] text-destructive">
          {t.agents.ready.notSaved} {choices.error}
        </p>
      )}
    </div>
  )
}

/** Rendered again only when its own rules change: the catalog shows hundreds of groups. */
export const RuleGroupBlock = React.memo(
  GroupBlock,
  (before, after) =>
    before.group === after.group &&
    before.terms === after.terms &&
    before.linked === after.linked &&
    before.configId === after.configId &&
    sameChoices(before.held, after.held),
)

interface RowProps {
  id: string
  group: RuleGroup
  rule: ReadyRule
  /** The rule as it is chosen, if it is. */
  choice: Choice | undefined
  terms: readonly string[]
  /** Chosen, but not held yet: its text is missing. */
  waiting: boolean
  /** Whether the text field takes the focus when it opens. */
  focusValue: React.RefObject<boolean>
  /** The radio button or checkbox, given its id and the id of what describes it. */
  control: (id: string, describedBy: string | undefined) => React.ReactNode
  onType: (text: string) => void
  onLeave: () => void
}

/** A rule as a choice: its name, the lines it writes when the name is not the line, its text. */
function RuleRow({
  id,
  group,
  rule,
  choice,
  terms,
  waiting,
  focusValue,
  control,
  onType,
  onLeave,
}: RowProps) {
  const t = useT()
  const { locale } = useLocale()
  const value = choice?.value ?? null
  const lines = extraLines(rule, locale)
  const linesId = lines.length > 0 ? `${id}-lines` : undefined
  return (
    <div className="flex items-start gap-3">
      {control(id, linesId)}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <label
            htmlFor={id}
            className="min-w-0 flex-1 basis-48 cursor-pointer text-[14px] leading-[1.45] text-foreground"
          >
            <RuleText text={fillValue(rule.title[locale], rule, value)} terms={terms} />
            {rule.alone && group.pick === 'many' && (
              <span className="text-muted-foreground"> · {t.agents.ready.alone}</span>
            )}
          </label>
          {rule.applied && <AppliedBadge />}
        </div>
        {lines.length > 0 && (
          <div
            id={linesId}
            className="flex flex-col gap-1 text-[13px] leading-normal text-muted-foreground"
          >
            {lines.map((line) => (
              <span key={line}>
                <RuleText text={fillValue(line, rule, value)} terms={terms} />
              </span>
            ))}
          </div>
        )}
        {rule.input && choice && (
          <ValueField
            id={`${id}-value`}
            checks={group.slot === CHECKS_SLOT}
            value={value ?? ''}
            waiting={waiting}
            focusOnOpen={focusValue}
            onChange={onType}
            onLeave={onLeave}
          />
        )}
      </div>
    </div>
  )
}

/** The text of a rule that takes one. It keeps what is typed, spaces included, while it is edited. */
function ValueField({
  id,
  checks,
  value,
  waiting,
  focusOnOpen,
  onChange,
  onLeave,
}: {
  id: string
  /** The text is a list of commands. */
  checks: boolean
  value: string
  waiting: boolean
  focusOnOpen: React.RefObject<boolean>
  onChange: (text: string) => void
  onLeave: () => void
}) {
  const t = useT()
  const [text, setText] = React.useState(value)
  const [seen, setSeen] = React.useState(value)
  const inputRef = React.useRef<HTMLInputElement>(null)
  // The saved text came back different (an import, a blank edit undone): show it.
  if (value !== seen) {
    setSeen(value)
    if (value.trim() !== text.trim()) setText(value)
  }
  React.useEffect(() => {
    if (focusOnOpen.current) inputRef.current?.focus()
  }, [focusOnOpen])

  return (
    <Field className="mt-1 max-w-2xl">
      <FieldLabel htmlFor={id}>
        {checks ? t.agents.ready.checksLabel : t.agents.ready.valueLabel}
      </FieldLabel>
      <Input
        ref={inputRef}
        id={id}
        value={text}
        maxLength={RULE_VALUE_MAX_LENGTH}
        autoComplete="off"
        spellCheck={false}
        className={checks ? 'font-mono text-[13px] [font-variant-ligatures:none]' : undefined}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          setText(event.target.value)
          onChange(event.target.value)
        }}
        onBlur={onLeave}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onLeave()
        }}
      />
      <FieldDescription id={`${id}-hint`}>
        {checks ? t.agents.ready.checksHint : t.agents.ready.valueHint}
      </FieldDescription>
      {waiting && (
        <p role="status" className="m-0 flex items-center gap-1.5 text-[12.5px] text-fg-secondary">
          <CircleDotIcon aria-hidden className="size-3.5 shrink-0 text-warning" />
          {t.agents.ready.valueWaiting}
        </p>
      )}
    </Field>
  )
}
