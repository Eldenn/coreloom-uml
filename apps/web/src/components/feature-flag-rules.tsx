'use client'

// Coreloom UI — FeatureFlagRules, part of the feature-flags block. A flag's targeting rules in one
// environment, read top to bottom: "if plan is one of pro, team → serve on". The first rule that
// matches decides; people no rule matches get the rollout percentage. `evaluateFeatureFlag` runs
// the same logic, for a "test a user" preview and for tests; your server should do the same.
import { PlusIcon, Trash2Icon } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TagsInput } from '@/components/ui/tags-input'
import { useCoreloomI18n } from '@/lib/i18n'

const FLAG_OPERATORS = ['in', 'not-in', 'contains', 'starts-with'] as const
type FeatureFlagOperator = (typeof FLAG_OPERATORS)[number]

interface FeatureFlagRule {
  id: string
  /** The context attribute it reads ("plan", "country", "email"). */
  attribute: string
  operator: FeatureFlagOperator
  values: string[]
  /** What people matched by this rule get. */
  serve: boolean
}

/** A flag in one environment. */
interface FeatureFlagState {
  enabled: boolean
  /** Share of the people no rule matches who get the flag, 0 to 100. */
  rollout: number
  rules: FeatureFlagRule[]
}

interface FeatureFlagAttribute {
  value: string
  label: string
}

type FeatureFlagEvaluation =
  | { value: false; reason: 'disabled' }
  | { value: boolean; reason: 'rule'; ruleId: string }
  | { value: boolean; reason: 'rollout'; bucket: number }

function ruleMatches(rule: FeatureFlagRule, context: Readonly<Record<string, string | undefined>>) {
  const actual = context[rule.attribute]
  if (actual === undefined) return rule.operator === 'not-in'
  const a = actual.toLowerCase()
  const values = rule.values.map((v) => v.toLowerCase())
  switch (rule.operator) {
    case 'in':
      return values.includes(a)
    case 'not-in':
      return !values.includes(a)
    case 'contains':
      return values.some((v) => a.includes(v))
    case 'starts-with':
      return values.some((v) => a.startsWith(v))
  }
}

/** A stable bucket from 0 to 99 for a flag and a person: the same person stays in or out as the rollout grows. */
function rolloutBucket(flagKey: string, id: string) {
  // FNV-1a: small, stable, well spread for short strings.
  let hash = 0x811c9dc5
  for (const ch of `${flagKey}:${id}`) {
    hash ^= ch.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % 100
}

/**
 * What a person gets: off when the flag is disabled, else the first matching rule's value, else on
 * when their bucket (from `context.id` or `context.key`) is under the rollout percentage.
 */
function evaluateFeatureFlag(
  flagKey: string,
  state: FeatureFlagState,
  context: Readonly<Record<string, string | undefined>>,
): FeatureFlagEvaluation {
  if (!state.enabled) return { value: false, reason: 'disabled' }
  const rule = state.rules.find((r) => ruleMatches(r, context))
  if (rule) return { value: rule.serve, reason: 'rule', ruleId: rule.id }
  const bucket = rolloutBucket(flagKey, context.id ?? context.key ?? '')
  return { value: bucket < state.rollout, reason: 'rollout', bucket }
}

function RuleRow({
  rule,
  index,
  attributes,
  disabled,
  onChange,
  onRemove,
}: {
  rule: FeatureFlagRule
  index: number
  attributes: FeatureFlagAttribute[]
  disabled?: boolean
  onChange: (rule: FeatureFlagRule) => void
  onRemove: () => void
}) {
  const t = useCoreloomI18n().messages.featureFlags
  const n = index + 1
  return (
    <li
      data-slot="feature-flag-rule"
      className="flex flex-col gap-2 rounded-md border border-border bg-background p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          {t.ruleN(n)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={t.removeRule(n)}
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Select
          value={rule.attribute}
          disabled={disabled}
          onValueChange={(attribute) => {
            onChange({ ...rule, attribute })
          }}
        >
          <SelectTrigger size="sm" aria-label={t.attribute(n)} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {attributes.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={rule.operator}
          disabled={disabled}
          onValueChange={(v) => {
            const operator = FLAG_OPERATORS.find((o) => o === v)
            if (operator) onChange({ ...rule, operator })
          }}
        >
          <SelectTrigger size="sm" aria-label={t.operator(n)} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FLAG_OPERATORS.map((o) => (
              <SelectItem key={o} value={o}>
                {t.operators[o]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <TagsInput
        value={rule.values}
        disabled={disabled}
        placeholder={t.valuesPlaceholder}
        aria-label={t.values(n)}
        onValueChange={(values) => {
          onChange({ ...rule, values })
        }}
      />
      <div className="flex items-center gap-2 text-[13px] text-fg-secondary">
        <span aria-hidden>{t.serve}</span>
        <Select
          value={rule.serve ? 'on' : 'off'}
          disabled={disabled}
          onValueChange={(v) => {
            onChange({ ...rule, serve: v === 'on' })
          }}
        >
          <SelectTrigger size="sm" aria-label={t.serveLabel(n)} className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="on">{t.on}</SelectItem>
            <SelectItem value="off">{t.off}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </li>
  )
}

/** The rule list with Add rule; `onChange` gets the whole new list. */
function FeatureFlagRules({
  rules,
  attributes,
  disabled,
  onChange,
}: {
  rules: FeatureFlagRule[]
  attributes: FeatureFlagAttribute[]
  disabled?: boolean
  onChange: (rules: FeatureFlagRule[]) => void
}) {
  const t = useCoreloomI18n().messages.featureFlags
  const baseId = React.useId()
  const count = React.useRef(0)
  const listRef = React.useRef<HTMLOListElement>(null)
  const addRef = React.useRef<HTMLButtonElement>(null)
  const addRule = () => {
    count.current += 1
    onChange([
      ...rules,
      {
        id: `${baseId}-${String(count.current)}`,
        attribute: attributes.at(0)?.value ?? '',
        operator: 'in',
        values: [],
        serve: true,
      },
    ])
  }
  const remove = (index: number) => {
    onChange(rules.filter((_, i) => i !== index))
    // The removed rule's button is gone: focus the rule that takes its place, or Add rule.
    requestAnimationFrame(() => {
      const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-slot=feature-flag-rule]')
      const next = rows?.[Math.min(index, rows.length - 1)]
      ;(next?.querySelector<HTMLElement>('button') ?? addRef.current)?.focus()
    })
  }
  return (
    <div className="flex flex-col gap-2">
      {rules.length > 0 ? (
        <ol ref={listRef} aria-label={t.rules} className="m-0 flex list-none flex-col gap-2 p-0">
          {rules.map((r, i) => (
            <RuleRow
              key={r.id}
              rule={r}
              index={i}
              attributes={attributes}
              disabled={disabled}
              onChange={(next) => {
                onChange(rules.map((x) => (x.id === r.id ? next : x)))
              }}
              onRemove={() => {
                remove(i)
              }}
            />
          ))}
        </ol>
      ) : (
        <p className="m-0 text-[12.5px] text-muted-foreground">{t.noRules}</p>
      )}
      <Button
        ref={addRef}
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={disabled === true || !attributes.length}
        onClick={addRule}
      >
        <PlusIcon />
        {t.addRule}
      </Button>
    </div>
  )
}

export {
  evaluateFeatureFlag,
  type FeatureFlagAttribute,
  type FeatureFlagEvaluation,
  type FeatureFlagOperator,
  type FeatureFlagRule,
  FeatureFlagRules,
  type FeatureFlagState,
  FLAG_OPERATORS,
  rolloutBucket,
}
