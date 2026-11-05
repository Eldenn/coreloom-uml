import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react'
import * as React from 'react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { type AiModel, formatTokenPrice, formatTokens } from '@/lib/ai'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** The provider's first letter in a small square: a mark that needs no logo. */
function ProviderMark({ provider, className }: { provider?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border bg-secondary font-mono text-[10px] leading-none font-semibold text-fg-secondary uppercase',
        className,
      )}
    >
      {(provider ?? '?').trim().charAt(0)}
    </span>
  )
}

/** Models in the order given, grouped by provider (in the order providers first appear). */
function byProvider(models: readonly AiModel[], other: string) {
  const groups = new Map<string, AiModel[]>()
  for (const m of models) {
    const key = m.provider ?? other
    groups.set(key, [...(groups.get(key) ?? []), m])
  }
  return [...groups.entries()]
}

function ModelRow({ model, selected }: { model: AiModel; selected: boolean }) {
  const { messages, locale } = useCoreloomI18n()
  const t = messages.ai.model
  const labels = t.capabilities as Record<string, string>
  const currency = model.pricing?.currency
  const price = model.pricing && {
    input: formatTokenPrice(model.pricing.input, locale, currency),
    output: formatTokenPrice(model.pricing.output, locale, currency),
  }
  const context =
    model.contextWindow !== undefined ? formatTokens(model.contextWindow, locale) : undefined
  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 font-medium break-words text-foreground">{model.name}</span>
          {model.capabilities?.map((c) => (
            <span
              key={c}
              data-slot="model-capability"
              className="inline-flex items-center rounded-pill border border-border bg-secondary px-1.5 py-px font-mono text-[10.5px] leading-[1.4] tracking-[0.02em] whitespace-nowrap text-fg-secondary"
            >
              {labels[c] ?? c}
            </span>
          ))}
          {selected && <span className="sr-only">{t.selected}</span>}
        </span>
        {model.description && (
          <span className="text-[12.5px] leading-[1.45] text-muted-foreground">
            {model.description}
          </span>
        )}
        {(!!context || !!price) && (
          <span className="flex flex-wrap gap-x-3 font-mono text-[11px] text-muted-foreground">
            {context && (
              <>
                <span aria-hidden>{t.context(context)}</span>
                <span className="sr-only">{t.contextLong(context)}</span>
              </>
            )}
            {price && (
              <>
                <span aria-hidden>{t.price(price.input, price.output)}</span>
                <span className="sr-only">{t.priceLong(price.input, price.output)}</span>
              </>
            )}
          </span>
        )}
      </div>
      <CheckIcon
        aria-hidden
        className={cn('mt-0.5 self-start text-primary', selected ? 'opacity-100' : 'opacity-0')}
      />
    </>
  )
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Every word typed must appear in the model's id, name, provider, description or capabilities. Plain
 *  substring matching: cmdk's fuzzy default lets "fast" match any model whose text holds f, a, s, t in order. */
function matches(value: string, search: string, keywords?: string[]) {
  const haystack = fold([value, ...(keywords ?? [])].join(' '))
  return fold(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
    ? 1
    : 0
}

/** The searchable list of models on its own: inside ModelPicker's popover, or inline on a settings page. */
function ModelList({
  models,
  value,
  onValueChange,
  autoFocus,
  className,
}: {
  models: readonly AiModel[]
  /** The chosen model's id: checked, and highlighted when the list opens. */
  value?: string
  onValueChange: (id: string) => void
  autoFocus?: boolean
  className?: string
}) {
  const t = useCoreloomI18n().messages.ai.model
  const labels = t.capabilities as Record<string, string>
  return (
    <Command
      data-slot="model-list"
      defaultValue={value}
      filter={matches}
      loop
      className={className}
    >
      <CommandInput placeholder={t.search} aria-label={t.search} autoFocus={autoFocus} />
      <CommandList className="max-h-[min(420px,calc(var(--radix-popover-content-available-height,468px)-48px))]">
        <CommandEmpty>{t.empty}</CommandEmpty>
        {byProvider(models, t.other).map(([provider, items]) => (
          <CommandGroup key={provider} heading={provider}>
            {items.map((m) => (
              <CommandItem
                key={m.id}
                value={m.id}
                keywords={[
                  m.name,
                  m.provider ?? '',
                  m.description ?? '',
                  ...(m.capabilities ?? []).map((c) => labels[c] ?? c),
                ]}
                disabled={m.disabled}
                onSelect={() => {
                  onValueChange(m.id)
                }}
                data-checked={m.id === value || undefined}
                className="items-start gap-2.5"
              >
                <ProviderMark provider={m.provider} className="mt-0.5" />
                <ModelRow model={m} selected={m.id === value} />
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  )
}

function ModelPicker({
  models,
  value,
  defaultValue,
  onValueChange,
  variant = 'ghost',
  size,
  placeholder,
  disabled,
  className,
  contentClassName,
  id,
  onBlur,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-labelledby': ariaLabelledBy,
}: {
  models: readonly AiModel[]
  value?: string
  defaultValue?: string
  onValueChange?: (id: string) => void
  /** "ghost" in a composer's toolbar, "outline" in a form (full width, like Select). */
  variant?: 'ghost' | 'outline'
  /** Height: "sm" (28 px, the default for ghost) or "default" (42 px, the default for outline). */
  size?: 'sm' | 'default'
  placeholder?: string
  disabled?: boolean
  className?: string
  contentClassName?: string
  id?: string
  /** Called when the list closes (forms mark the field as touched). */
  onBlur?: () => void
  'aria-invalid'?: boolean | 'true' | 'false'
  'aria-describedby'?: string
  /** A label elsewhere (a form field's): the name becomes that label followed by the chosen model. */
  'aria-labelledby'?: string
}) {
  const t = useCoreloomI18n().messages.ai.model
  const valueId = React.useId()
  const [open, setOpen] = React.useState(false)
  const [inner, setInner] = React.useState(defaultValue ?? '')
  const current = value ?? inner
  const selected = models.find((m) => m.id === current)
  size ??= variant === 'outline' ? 'default' : 'sm'

  const pick = (next: string) => {
    if (value === undefined) setInner(next)
    onValueChange?.(next)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onBlur?.()
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          // eslint-disable-next-line jsx-a11y/role-has-required-aria-props -- PopoverTrigger adds aria-controls.
          role="combobox"
          id={id}
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          // Always named with what it picks and what's chosen: "Default model Claude Haiku" from a form's
          // label, "Model: Claude Haiku" on its own.
          aria-labelledby={ariaLabelledBy ? `${ariaLabelledBy} ${valueId}` : undefined}
          aria-label={
            ariaLabelledBy ? undefined : t.trigger(selected?.name ?? placeholder ?? t.placeholder)
          }
          disabled={disabled}
          data-slot="model-picker-trigger"
          data-variant={variant}
          data-placeholder={selected ? undefined : ''}
          className={cn(
            'flex min-w-0 cursor-pointer items-center gap-2 font-sans whitespace-nowrap text-foreground transition-[background-color,border-color,box-shadow] duration-base ease-out outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55 data-[placeholder]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0',
            variant === 'ghost' &&
              'max-w-full rounded-md border border-transparent bg-transparent px-2 hover:bg-accent aria-expanded:bg-accent',
            variant === 'outline' &&
              'w-full justify-between rounded-md border border-input bg-inset px-[13px] focus-visible:border-primary aria-expanded:border-primary aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive-subtle',
            size === 'sm'
              ? "h-7 text-[12.5px] [&_svg:not([class*='size-'])]:size-3.5"
              : "h-[42px] text-[14px] [&_svg:not([class*='size-'])]:size-4",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected && <ProviderMark provider={selected.provider} />}
            <span id={valueId} className="truncate">
              {selected ? selected.name : (placeholder ?? t.placeholder)}
            </span>
          </span>
          <ChevronsUpDownIcon aria-hidden className="text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className={cn(
          'w-[min(400px,calc(100vw-32px))] p-0',
          variant === 'outline' && 'min-w-(--radix-popover-trigger-width)',
          contentClassName,
        )}
      >
        <ModelList models={models} value={current} onValueChange={pick} />
      </PopoverContent>
    </Popover>
  )
}

export { ModelList, ModelPicker }
