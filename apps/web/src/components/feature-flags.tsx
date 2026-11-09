'use client'

// Coreloom UI — FeatureFlags (block). A product's feature flags in one environment at a time: each
// flag's name, key and tags, an on / off switch, its rollout and rules in a line, and a panel to
// edit them — on / off, the rollout percentage, targeting rules (FeatureFlagRules) — with the flag's
// history. Nothing is evaluated or stored here: `onChange` sends a flag's new state in an
// environment to your API, which serves it to your apps (`evaluateFeatureFlag` shows the logic).
import { FlagIcon, PlusIcon, SearchIcon, SlidersHorizontalIcon } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'

import {
  type FeatureFlagAttribute,
  FeatureFlagRules,
  type FeatureFlagState,
} from '@/components/feature-flag-rules'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useAppForm } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { RelativeTime } from '@/components/ui/relative-time'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { SliderInput } from '@/components/ui/slider-input'
import { Switch } from '@/components/ui/switch'
import { Timeline, TimelineItem } from '@/components/ui/timeline'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface FeatureFlagChange {
  id: string
  at: Date
  author?: string
  /** The environment it happened in, by id. */
  environment?: string
  /** What changed, in a sentence: "Rollout 25% → 50%". */
  text: string
}

interface FeatureFlag {
  /** What your code checks: `new-checkout`. */
  key: string
  name: string
  description?: string
  tags?: string[]
  /** The flag in each environment, by environment id; missing reads as off. */
  environments: Partial<Record<string, FeatureFlagState>>
  history?: FeatureFlagChange[]
}

interface FeatureFlagEnvironment {
  id: string
  name: string
}

interface FeatureFlagInput {
  key: string
  name: string
  description: string
}

const OFF: FeatureFlagState = { enabled: false, rollout: 0, rules: [] }

/** `New checkout` → `new-checkout`: the key a name suggests. */
function flagKeyFromName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function CreateFlagDialog({ onCreate }: { onCreate: (input: FeatureFlagInput) => unknown }) {
  const t = useCoreloomI18n().messages.featureFlags
  const [open, setOpen] = React.useState(false)
  const form = useAppForm({
    defaultValues: { name: '', key: '', description: '' },
    validators: {
      onChange: z.object({
        name: z.string().trim().min(1, t.nameRequired),
        key: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/, t.keyInvalid),
        description: z.string(),
      }),
    },
    onSubmit: async ({ value }) => {
      await onCreate({ ...value, name: value.name.trim() })
      setOpen(false)
    },
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) form.reset()
        setOpen(next)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {t.create}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            void form.handleSubmit()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t.createTitle}</DialogTitle>
            <DialogDescription>{t.createDescription}</DialogDescription>
          </DialogHeader>
          <form.AppField
            name="name"
            listeners={{
              onChange: ({ value }) => {
                // The key follows the name until someone edits the key itself.
                if (!form.getFieldMeta('key')?.isDirty)
                  form.setFieldValue('key', flagKeyFromName(value), { dontUpdateMeta: true })
              },
            }}
          >
            {(field) => <field.TextField label={t.name} autoComplete="off" />}
          </form.AppField>
          <form.AppField name="key">
            {(field) => (
              <field.TextField
                label={t.key}
                description={t.keyHint}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
            )}
          </form.AppField>
          <form.AppField name="description">
            {(field) => <field.TextareaField label={t.descriptionLabel} rows={2} />}
          </form.AppField>
          <DialogFooter>
            <form.AppForm>
              <form.SubmitButton pendingLabel={t.creating}>{t.create}</form.SubmitButton>
            </form.AppForm>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function useSummary() {
  const t = useCoreloomI18n().messages.featureFlags
  return (state: FeatureFlagState) => {
    if (!state.enabled) return t.summaryOff
    return t.summary(state.rollout, state.rules.length)
  }
}

function FlagPanel({
  flag,
  environment,
  environments,
  attributes,
  onClose,
  onChange,
}: {
  flag: FeatureFlag
  environment: FeatureFlagEnvironment
  environments: FeatureFlagEnvironment[]
  attributes: FeatureFlagAttribute[]
  onClose: () => void
  onChange?: (key: string, environment: string, state: FeatureFlagState) => unknown
}) {
  const t = useCoreloomI18n().messages.featureFlags
  const [draft, setDraft] = React.useState(flag.environments[environment.id] ?? OFF)
  const [saving, setSaving] = React.useState(false)
  const id = React.useId()
  const readOnly = !onChange
  const envName = (envId: string | undefined) => environments.find((e) => e.id === envId)?.name
  const save = () => {
    if (!onChange) return
    setSaving(true)
    void Promise.resolve(onChange(flag.key, environment.id, draft))
      .then(onClose)
      .finally(() => {
        setSaving(false)
      })
  }
  return (
    <>
      <SheetHeader>
        <SheetTitle>{flag.name}</SheetTitle>
        <SheetDescription>{t.panelDescription(environment.name)}</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
        <code className="w-fit rounded-sm bg-inset px-1.5 py-0.5 font-mono text-[12.5px] text-fg-secondary">
          {flag.key}
        </code>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor={`${id}-on`} className="text-[13.5px] font-medium text-foreground">
            {t.enabledIn(environment.name)}
          </label>
          <Switch
            id={`${id}-on`}
            checked={draft.enabled}
            disabled={readOnly}
            onCheckedChange={(enabled) => {
              setDraft((d) => ({ ...d, enabled }))
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <p id={`${id}-rollout`} className="m-0 text-[13.5px] font-medium text-foreground">
            {t.rollout}
          </p>
          <p className="m-0 text-[12.5px] text-muted-foreground">{t.rolloutHint}</p>
          <SliderInput
            value={draft.rollout}
            min={0}
            max={100}
            step={5}
            label={t.rollout}
            disabled={readOnly || !draft.enabled}
            formatOptions={{ style: 'unit', unit: 'percent' }}
            onValueChange={(rollout) => {
              setDraft((d) => ({ ...d, rollout }))
            }}
          />
        </div>
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[13.5px] font-medium text-foreground">{t.rules}</p>
          <p className="m-0 text-[12.5px] text-muted-foreground">{t.rulesHint}</p>
          <FeatureFlagRules
            rules={draft.rules}
            attributes={attributes}
            disabled={readOnly || !draft.enabled}
            onChange={(rules) => {
              setDraft((d) => ({ ...d, rules }))
            }}
          />
        </div>
        {!!flag.history?.length && (
          <div className="flex flex-col gap-3">
            <p id={`${id}-history`} className="m-0 text-[13.5px] font-medium text-foreground">
              {t.history}
            </p>
            <Timeline aria-labelledby={`${id}-history`}>
              {flag.history.map((h) => (
                <TimelineItem
                  key={h.id}
                  title={h.text}
                  description={[h.author, envName(h.environment)].filter(Boolean).join(' · ')}
                  time={<RelativeTime date={h.at} style="short" />}
                />
              ))}
            </Timeline>
          </div>
        )}
      </div>
      {onChange && (
        <SheetFooter className="flex-row justify-end border-t border-border">
          <Button variant="outline" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button onClick={save} disabled={saving} aria-busy={saving || undefined}>
            {t.save}
          </Button>
        </SheetFooter>
      )}
    </>
  )
}

function FlagRow({
  flag,
  environment,
  onToggle,
  onOpen,
}: {
  flag: FeatureFlag
  environment: FeatureFlagEnvironment
  onToggle?: (enabled: boolean) => void
  onOpen: (button: HTMLButtonElement) => void
}) {
  const t = useCoreloomI18n().messages.featureFlags
  const summary = useSummary()
  const state = flag.environments[environment.id] ?? OFF
  return (
    <li
      data-slot="feature-flag"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle px-5 py-3.5 last:border-b-0"
    >
      <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-medium text-foreground">{flag.name}</span>
          <code className="font-mono text-[12px] text-muted-foreground">{flag.key}</code>
        </span>
        {flag.description && (
          <span className="text-[12.5px] text-muted-foreground">{flag.description}</span>
        )}
        {!!flag.tags?.length && (
          <ul aria-label={t.tags} className="m-0 flex list-none flex-wrap gap-1 p-0">
            {flag.tags.map((tag) => (
              <li key={tag}>
                <Badge variant="outline">{tag}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="mr-2 text-[12.5px] text-fg-secondary">{summary(state)}</span>
        <Switch
          checked={state.enabled}
          disabled={!onToggle}
          aria-label={t.toggle(flag.name, environment.name)}
          onCheckedChange={onToggle}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.edit(flag.name)}
          onClick={(e) => {
            onOpen(e.currentTarget)
          }}
        >
          <SlidersHorizontalIcon />
        </Button>
      </div>
    </li>
  )
}

function FeatureFlags({
  flags,
  environments,
  attributes = [],
  defaultEnvironment,
  onChange,
  onCreate,
  className,
}: {
  flags: FeatureFlag[]
  environments: FeatureFlagEnvironment[]
  /** What rules can target: the attributes of the context your apps send ("plan", "country"). */
  attributes?: FeatureFlagAttribute[]
  defaultEnvironment?: string
  /** Saves a flag's state in one environment: the switch, or the panel's Save. Without it, read only. */
  onChange?: (key: string, environment: string, state: FeatureFlagState) => unknown
  /** Creates a flag (off everywhere). Shows New flag. */
  onCreate?: (input: FeatureFlagInput) => unknown
  className?: string
}) {
  const t = useCoreloomI18n().messages.featureFlags
  const [envId, setEnvId] = React.useState(defaultEnvironment ?? environments.at(0)?.id ?? '')
  const [query, setQuery] = React.useState('')
  const [openKey, setOpenKey] = React.useState<string | null>(null)
  const id = React.useId()
  // The panel opens from a row's button; focus goes back to it when the panel closes.
  const opener = React.useRef<HTMLElement | null>(null)
  const environment = environments.find((e) => e.id === envId) ?? environments.at(0)
  const q = query.trim().toLowerCase()
  const shown = flags.filter(
    (f) =>
      !q ||
      f.name.toLowerCase().includes(q) ||
      f.key.includes(q) ||
      f.tags?.some((tag) => tag.toLowerCase().includes(q)),
  )
  const open = flags.find((f) => f.key === openKey)
  if (!environment) return null

  return (
    <div
      data-slot="feature-flags"
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-border bg-card',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <label htmlFor={`${id}-env`} className="sr-only">
          {t.environment}
        </label>
        <Select value={environment.id} onValueChange={setEnvId}>
          <SelectTrigger id={`${id}-env`} size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {environments.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative min-w-40 flex-1">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            placeholder={t.search}
            aria-label={t.search}
            className="h-8 pl-8"
            onChange={(e) => {
              setQuery(e.target.value)
            }}
          />
        </div>
        {onCreate && <CreateFlagDialog onCreate={onCreate} />}
      </div>
      {shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
          <FlagIcon aria-hidden className="size-6 text-muted-foreground" />
          <p className="m-0 text-[13.5px] text-muted-foreground">
            {flags.length ? t.noMatch : t.empty}
          </p>
        </div>
      ) : (
        <ul aria-label={t.listLabel(environment.name)} className="m-0 list-none p-0">
          {shown.map((f) => (
            <FlagRow
              key={f.key}
              flag={f}
              environment={environment}
              onToggle={
                onChange
                  ? (enabled) =>
                      void onChange(f.key, environment.id, {
                        ...(f.environments[environment.id] ?? OFF),
                        enabled,
                      })
                  : undefined
              }
              onOpen={(button) => {
                opener.current = button
                setOpenKey(f.key)
              }}
            />
          ))}
        </ul>
      )}
      <Sheet
        open={!!open}
        onOpenChange={(next) => {
          if (!next) setOpenKey(null)
        }}
      >
        <SheetContent
          className="w-full sm:max-w-md"
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            opener.current?.focus()
          }}
        >
          {open && (
            <FlagPanel
              key={`${open.key}:${environment.id}`}
              flag={open}
              environment={environment}
              environments={environments}
              attributes={attributes}
              onChange={onChange}
              onClose={() => {
                setOpenKey(null)
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

export {
  type FeatureFlag,
  type FeatureFlagChange,
  type FeatureFlagEnvironment,
  type FeatureFlagInput,
  FeatureFlags,
  flagKeyFromName,
}
