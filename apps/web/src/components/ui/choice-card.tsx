import { CheckIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '@/lib/utils'

interface RadioCardGroupContext {
  name: string
  value: string
  disabled?: boolean
  invalid?: boolean
  select: (value: string) => void
}

const GroupContext = React.createContext<RadioCardGroupContext | null>(null)

const cardClass =
  'group/choice-card relative flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition-[border-color,background-color,box-shadow] duration-fast ease-out hover:border-border-strong has-checked:border-primary has-checked:bg-primary-subtle has-focus-visible:ring-[3px] has-focus-visible:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-55 has-disabled:hover:border-border has-[[aria-invalid=true]]:border-destructive data-[invalid]:border-destructive'

/** The cards' text: title, description, and whatever else goes on the card (a price). */
function CardBody({
  icon,
  title,
  description,
  descriptionId,
  children,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  descriptionId: string
  children?: React.ReactNode
}) {
  return (
    <>
      {icon ? (
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground group-has-checked/choice-card:bg-background group-has-checked/choice-card:text-primary-text [&_svg]:size-[18px]"
        >
          {icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[14px] leading-tight font-medium text-foreground">{title}</span>
        {description ? (
          <span
            id={descriptionId}
            className="text-[13px] leading-snug text-muted-foreground group-has-checked/choice-card:text-fg-secondary"
          >
            {description}
          </span>
        ) : null}
        {children}
      </span>
    </>
  )
}

function RadioCardGroup({
  value,
  defaultValue = '',
  onValueChange,
  name,
  disabled,
  orientation = 'vertical',
  className,
  children,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** The radios' form name; generated when not given. */
  name?: string
  disabled?: boolean
  /** Cards in a column (default) or in a responsive row. */
  orientation?: 'vertical' | 'horizontal'
  className?: string
  children: React.ReactNode
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const autoNameId = React.useId()
  const [inner, setInner] = React.useState(defaultValue)
  const current = value ?? inner
  const invalid = ariaInvalid === true || ariaInvalid === 'true'
  const context = React.useMemo<RadioCardGroupContext>(
    () => ({
      name: name ?? autoNameId,
      value: current,
      disabled,
      invalid,
      select: (next) => {
        if (value === undefined) setInner(next)
        onValueChange?.(next)
      },
    }),
    [name, autoNameId, current, disabled, invalid, value, onValueChange],
  )
  return (
    <GroupContext value={context}>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        data-slot="radio-card-group"
        data-orientation={orientation}
        className={cn(
          'grid gap-3',
          orientation === 'horizontal' && 'grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]',
          className,
        )}
      >
        {children}
      </div>
    </GroupContext>
  )
}

function RadioCard({
  value,
  title,
  description,
  icon,
  disabled,
  className,
  children,
}: {
  value: string
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
  className?: string
  /** More content under the description (a price, a badge). Read as part of the description. */
  children?: React.ReactNode
}) {
  const group = React.use(GroupContext)
  if (!group) throw new Error('RadioCard must be inside a RadioCardGroup.')
  const descriptionId = React.useId()
  return (
    <label
      data-slot="radio-card"
      data-invalid={group.invalid ? '' : undefined}
      className={cn(cardClass, className)}
    >
      <CardBody icon={icon} title={title} description={description} descriptionId={descriptionId}>
        {children}
      </CardBody>
      <input
        type="radio"
        name={group.name}
        value={value}
        checked={group.value === value}
        disabled={(group.disabled ?? false) || (disabled ?? false)}
        aria-describedby={description ? descriptionId : undefined}
        onChange={() => {
          group.select(value)
        }}
        className="peer mt-0.5 size-5 shrink-0 cursor-[inherit] appearance-none rounded-full border border-border-strong bg-inset outline-none checked:border-[6px] checked:border-primary"
      />
    </label>
  )
}

function CheckboxCard({
  checked,
  defaultChecked = false,
  onCheckedChange,
  title,
  description,
  icon,
  name,
  value,
  disabled,
  className,
  children,
  'aria-invalid': ariaInvalid,
}: {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  name?: string
  value?: string
  disabled?: boolean
  className?: string
  /** More content under the description (a price, a badge). */
  children?: React.ReactNode
  'aria-invalid'?: boolean | 'true' | 'false'
}) {
  const [inner, setInner] = React.useState(defaultChecked)
  const current = checked ?? inner
  const descriptionId = React.useId()
  return (
    <label data-slot="checkbox-card" className={cn(cardClass, className)}>
      <CardBody icon={icon} title={title} description={description} descriptionId={descriptionId}>
        {children}
      </CardBody>
      <span className="relative mt-0.5 flex size-5 shrink-0">
        <input
          type="checkbox"
          name={name}
          value={value}
          checked={current}
          disabled={disabled}
          aria-invalid={ariaInvalid}
          aria-describedby={description ? descriptionId : undefined}
          onChange={(e) => {
            if (checked === undefined) setInner(e.target.checked)
            onCheckedChange?.(e.target.checked)
          }}
          className="peer size-5 cursor-[inherit] appearance-none rounded-sm border border-border-strong bg-inset outline-none checked:border-transparent checked:bg-primary aria-invalid:border-destructive"
        />
        <CheckIcon
          aria-hidden
          strokeWidth={3}
          className="pointer-events-none absolute inset-0 m-auto hidden size-[13px] text-primary-foreground peer-checked:block"
        />
      </span>
    </label>
  )
}

export { CheckboxCard, RadioCard, RadioCardGroup }
