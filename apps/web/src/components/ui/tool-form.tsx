'use client'

// Coreloom UI — ToolForm. A tool that asks before it goes on: the agent needs a date, a name, a
// choice, and the person fills them in right in the conversation. The answer goes back as the
// tool's output (`addToolOutput`), and the form then shows what was sent. Use it for tools that
// have no `execute` on the server, so they wait for the browser to answer.
//
//   const tools: ToolComponents<MyTools> = {
//     askUser: formTool(), // the model sends { title, fields: [{ name, label, type }] } as input
//     scheduleCall: formTool({ fields: [{ name: 'day', label: 'Day', type: 'date', required: true }] }),
//   }
//   <Chat tools={tools} onToolOutput={addToolOutput} … />
import { CheckCircle2Icon, XCircleIcon } from 'lucide-react'
import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ToolComponent } from '@/components/ui/tool-call'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface FieldBase {
  /** The key in the answer: `{ [name]: value }`. */
  name: string
  label: string
  /** A hint under the field. */
  description?: string
  required?: boolean
}

/** One question in the form. Dates are `YYYY-MM-DD` strings, numbers are numbers. */
type ToolFormField =
  | (FieldBase & {
      type?: 'text' | 'email' | 'url' | 'textarea'
      placeholder?: string
      maxLength?: number
      defaultValue?: string
    })
  | (FieldBase & {
      type: 'number'
      min?: number
      max?: number
      step?: number
      placeholder?: string
      defaultValue?: number
    })
  | (FieldBase & { type: 'date'; min?: string; max?: string; defaultValue?: string })
  | (FieldBase & {
      type: 'select'
      options: readonly { value: string; label: string }[]
      defaultValue?: string
    })
  | (FieldBase & { type: 'checkbox'; defaultValue?: boolean })

/** The answer, by field name. An optional field left empty is `null`. */
type ToolFormValues = Record<string, string | number | boolean | null>

/** What's wrong with a field: the locale turns it into a sentence. */
type ToolFormError =
  | { type: 'required' | 'number' | 'email' | 'url' }
  | { type: 'min' | 'max'; limit: number | string }

const TYPES = new Set(['text', 'email', 'url', 'textarea', 'number', 'date', 'select', 'checkbox'])
const DATE = /^\d{4}-\d{2}-\d{2}$/
const NAME = /^[\w.-]{1,64}$/

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const date = (v: unknown) => (typeof v === 'string' && DATE.test(v) ? v : undefined)

/**
 * Reads the fields a model sent (a tool's input) as untrusted data: unknown types become text,
 * fields without a usable name are dropped, names are unique, and there are at most 20.
 */
function readToolFormFields(value: unknown): ToolFormField[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const fields: ToolFormField[] = []
  for (const raw of value as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue
    const f = raw as Record<string, unknown>
    const name = str(f.name)
    if (!name || !NAME.test(name) || seen.has(name)) continue
    const base = {
      name,
      label: str(f.label) ?? name,
      ...(str(f.description) ? { description: str(f.description) } : {}),
      ...(f.required === true ? { required: true } : {}),
    }
    const type = typeof f.type === 'string' && TYPES.has(f.type) ? f.type : 'text'
    let field: ToolFormField | undefined
    if (type === 'number')
      field = {
        ...base,
        type,
        min: num(f.min),
        max: num(f.max),
        step: num(f.step),
        placeholder: str(f.placeholder),
        defaultValue: num(f.defaultValue),
      }
    else if (type === 'date')
      field = {
        ...base,
        type,
        min: date(f.min),
        max: date(f.max),
        defaultValue: date(f.defaultValue),
      }
    else if (type === 'checkbox') field = { ...base, type, defaultValue: f.defaultValue === true }
    else if (type === 'select') {
      const options = (Array.isArray(f.options) ? (f.options as unknown[]) : []).flatMap(
        (o): { value: string; label: string }[] => {
          if (typeof o === 'string' && o) return [{ value: o, label: o }]
          if (typeof o !== 'object' || o === null) return []
          const { value: v, label } = o as Record<string, unknown>
          const optionValue = str(v)
          return optionValue ? [{ value: optionValue, label: str(label) ?? optionValue }] : []
        },
      )
      const unique = options.filter((o, i) => options.findIndex((p) => p.value === o.value) === i)
      // A choice with nothing to choose from can't be answered: ask in words instead.
      field = unique.length
        ? {
            ...base,
            type,
            options: unique,
            defaultValue: unique.some((o) => o.value === f.defaultValue)
              ? (f.defaultValue as string)
              : undefined,
          }
        : { ...base, type: 'text' }
    } else
      field = {
        ...base,
        type: type as 'text' | 'email' | 'url' | 'textarea',
        placeholder: str(f.placeholder),
        maxLength: num(f.maxLength),
        defaultValue: typeof f.defaultValue === 'string' ? f.defaultValue : undefined,
      }
    // Drop the keys left undefined, so the field reads like one written by hand.
    fields.push(
      Object.fromEntries(Object.entries(field).filter(([, v]) => v !== undefined)) as ToolFormField,
    )
    seen.add(name)
    if (fields.length === 20) break
  }
  return fields
}

/** What the form holds while it's being filled in: text for every input, a boolean for checkboxes. */
type Draft = Record<string, string | boolean>

function initialDraft(fields: readonly ToolFormField[]): Draft {
  return Object.fromEntries(
    fields.map((f) => [
      f.name,
      f.type === 'checkbox'
        ? (f.defaultValue ?? false)
        : f.defaultValue === undefined
          ? ''
          : String(f.defaultValue),
    ]),
  )
}

function isWebAddress(value: string) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

/** Checks a draft against its fields. Returns the errors by name (empty when it can be sent). */
function validateToolForm(
  fields: readonly ToolFormField[],
  draft: Record<string, string | boolean | undefined>,
): Partial<Record<string, ToolFormError>> {
  const errors: Partial<Record<string, ToolFormError>> = {}
  for (const f of fields) {
    const raw = draft[f.name]
    if (f.type === 'checkbox') {
      if (f.required && raw !== true) errors[f.name] = { type: 'required' }
      continue
    }
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) {
      if (f.required) errors[f.name] = { type: 'required' }
      continue
    }
    if (f.type === 'number') {
      const n = Number(value)
      if (!Number.isFinite(n)) errors[f.name] = { type: 'number' }
      else if (f.min !== undefined && n < f.min) errors[f.name] = { type: 'min', limit: f.min }
      else if (f.max !== undefined && n > f.max) errors[f.name] = { type: 'max', limit: f.max }
    } else if (f.type === 'date') {
      if (!DATE.test(value)) errors[f.name] = { type: 'required' }
      else if (f.min && value < f.min) errors[f.name] = { type: 'min', limit: f.min }
      else if (f.max && value > f.max) errors[f.name] = { type: 'max', limit: f.max }
    } else if (f.type === 'select') {
      if (!f.options.some((o) => o.value === value)) errors[f.name] = { type: 'required' }
    } else if (f.type === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[f.name] = { type: 'email' }
    } else if (f.type === 'url') {
      if (!isWebAddress(value)) errors[f.name] = { type: 'url' }
    }
  }
  return errors
}

/** The answer from a valid draft: numbers as numbers, empty optional fields as null. */
function toolFormValues(fields: readonly ToolFormField[], draft: Draft): ToolFormValues {
  return Object.fromEntries<ToolFormValues[string]>(
    fields.map((f) => {
      const raw = draft[f.name]
      if (f.type === 'checkbox') return [f.name, raw === true]
      const value = typeof raw === 'string' ? raw.trim() : ''
      if (!value) return [f.name, null]
      return [f.name, f.type === 'number' ? Number(value) : value]
    }),
  )
}

/** `YYYY-MM-DD` ↔ a local date, so the day picked is the day sent, in any time zone. */
function toDate(value: string) {
  if (!DATE.test(value)) return undefined
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}
function fromDate(value: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(value.getFullYear())}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function ToolForm({
  fields,
  title,
  description,
  submitLabel,
  onSubmit,
  onCancel,
  values,
  cancelled = false,
  className,
}: {
  fields: readonly ToolFormField[]
  /** What the agent asks, in one line. Defaults to "The agent needs a few details". */
  title?: React.ReactNode
  description?: React.ReactNode
  /** Defaults to "Send". */
  submitLabel?: React.ReactNode
  /** Called with the answer once every field is valid. Wire it to the tool's output. */
  onSubmit?: (values: ToolFormValues) => void
  /** Offers Cancel. */
  onCancel?: () => void
  /** The answer that was sent: the form shows it, read-only, instead of the inputs. */
  values?: Record<string, unknown>
  /** The form was cancelled: shows that instead of the inputs. */
  cancelled?: boolean
  className?: string
}) {
  const i18n = useCoreloomI18n()
  const t = i18n.messages.ai.toolForm
  const { locale } = i18n
  const id = React.useId()
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`
  const [draft, setDraft] = React.useState<Draft>(() => initialDraft(fields))
  const [tried, setTried] = React.useState(false)
  const errors = tried ? validateToolForm(fields, draft) : {}

  const formatDate = (value: string) => {
    const d = toDate(value)
    return d ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d) : value
  }
  const message = (field: ToolFormField, error: ToolFormError) => {
    if (error.type === 'min' || error.type === 'max') {
      if (field.type === 'date') {
        const limit = formatDate(String(error.limit))
        return error.type === 'min' ? t.errors.dateMin(limit) : t.errors.dateMax(limit)
      }
      const limit = new Intl.NumberFormat(locale).format(Number(error.limit))
      return error.type === 'min' ? t.errors.min(limit) : t.errors.max(limit)
    }
    return t.errors[error.type]
  }
  const set = (name: string, value: string | boolean) => {
    setDraft((d) => ({ ...d, [name]: value }))
  }

  const header = (
    <div className="flex flex-col gap-0.5">
      <p id={titleId} className="m-0 text-[14px] font-medium text-foreground">
        {title ?? t.title}
      </p>
      {Boolean(description) && (
        <p id={descriptionId} className="m-0 text-[13px] text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  )
  const frame = cn(
    'flex max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-4',
    className,
  )

  if (cancelled || values) {
    const shown = (f: ToolFormField) => {
      const v = values?.[f.name]
      if (v === null || v === undefined || v === '') return t.notGiven
      if (f.type === 'checkbox') return v === true ? t.yes : t.no
      if (f.type === 'date' && typeof v === 'string') return formatDate(v)
      if (f.type === 'number' && typeof v === 'number')
        return new Intl.NumberFormat(locale).format(v)
      if (f.type === 'select')
        return f.options.find((o) => o.value === v)?.label ?? JSON.stringify(v)
      return typeof v === 'string' || typeof v === 'number' ? String(v) : JSON.stringify(v)
    }
    return (
      <div
        role="group"
        aria-labelledby={titleId}
        data-slot="tool-form"
        data-state={cancelled ? 'cancelled' : 'sent'}
        className={frame}
      >
        <div className="flex items-start justify-between gap-3">
          {header}
          {cancelled ? (
            <Badge variant="secondary">
              <XCircleIcon aria-hidden />
              {t.cancelled}
            </Badge>
          ) : (
            <Badge variant="success">
              <CheckCircle2Icon aria-hidden />
              {t.sent}
            </Badge>
          )}
        </div>
        {!cancelled && fields.length > 0 && (
          <dl className="m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
            {fields.map((f) => (
              <React.Fragment key={f.name}>
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="m-0 break-words text-foreground">{shown(f)}</dd>
              </React.Fragment>
            ))}
          </dl>
        )}
      </div>
    )
  }

  const submit = () => {
    const found = validateToolForm(fields, draft)
    const first = fields.find((f) => found[f.name])
    if (first) {
      setTried(true)
      // The errors render with this update; focus the first field that needs fixing after it.
      requestAnimationFrame(() => {
        document.getElementById(`${id}-${first.name}`)?.focus()
      })
      return
    }
    onSubmit?.(toolFormValues(fields, draft))
  }

  return (
    <form
      noValidate
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      data-slot="tool-form"
      data-state="open"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className={frame}
    >
      {header}
      <FieldGroup className="gap-4">
        {fields.map((f) => {
          const fieldId = `${id}-${f.name}`
          const hintId = `${fieldId}-hint`
          const errorId = `${fieldId}-error`
          const error = errors[f.name]
          const describedBy =
            [f.description ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') ||
            undefined
          const common = {
            id: fieldId,
            'aria-invalid': error ? true : undefined,
            'aria-describedby': describedBy,
            'aria-required': f.required ? true : undefined,
          }
          const value = draft[f.name]
          const text = typeof value === 'string' ? value : ''
          const hint = f.description && (
            <p id={hintId} className="m-0 text-[12px] text-muted-foreground">
              {f.description}
            </p>
          )
          const errorText = error && <FieldError id={errorId}>{message(f, error)}</FieldError>
          const label = (
            <FieldLabel htmlFor={fieldId}>
              {f.label}
              {!f.required && f.type !== 'checkbox' && (
                <span className="font-normal text-muted-foreground">({t.optional})</span>
              )}
            </FieldLabel>
          )

          if (f.type === 'checkbox')
            return (
              <Field key={f.name} orientation="horizontal" className="flex-wrap">
                <Checkbox
                  {...common}
                  checked={value === true}
                  onCheckedChange={(checked) => {
                    set(f.name, checked === true)
                  }}
                />
                {label}
                {hint && <div className="basis-full">{hint}</div>}
                {errorText && <div className="basis-full">{errorText}</div>}
              </Field>
            )

          let control: React.ReactNode
          if (f.type === 'textarea')
            control = (
              <Textarea
                {...common}
                value={text}
                placeholder={f.placeholder}
                maxLength={f.maxLength}
                rows={3}
                onChange={(e) => {
                  set(f.name, e.target.value)
                }}
              />
            )
          else if (f.type === 'date') {
            const min = f.min ? toDate(f.min) : undefined
            const max = f.max ? toDate(f.max) : undefined
            control = (
              <DatePicker
                id={fieldId}
                value={toDate(text)}
                onValueChange={(d) => {
                  set(f.name, d ? fromDate(d) : '')
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                calendarProps={{
                  disabled: [...(min ? [{ before: min }] : []), ...(max ? [{ after: max }] : [])],
                  defaultMonth: toDate(text) ?? min,
                }}
              />
            )
          } else if (f.type === 'select')
            control = (
              <Select
                value={text}
                onValueChange={(v) => {
                  set(f.name, v)
                }}
              >
                <SelectTrigger {...common}>
                  <SelectValue placeholder={t.choose} />
                </SelectTrigger>
                <SelectContent>
                  {f.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          else
            control = (
              <Input
                {...common}
                type={f.type === 'number' ? 'number' : (f.type ?? 'text')}
                inputMode={f.type === 'number' ? 'decimal' : undefined}
                value={text}
                placeholder={f.placeholder}
                maxLength={f.type === 'number' ? undefined : f.maxLength}
                min={f.type === 'number' ? f.min : undefined}
                max={f.type === 'number' ? f.max : undefined}
                step={f.type === 'number' ? f.step : undefined}
                onChange={(e) => {
                  set(f.name, e.target.value)
                }}
              />
            )
          return (
            <Field key={f.name}>
              {label}
              {control}
              {hint}
              {errorText}
            </Field>
          )
        })}
      </FieldGroup>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            {t.cancel}
          </Button>
        )}
        <Button type="submit" size="sm">
          {submitLabel ?? t.submit}
        </Button>
      </div>
    </form>
  )
}

/** Something read from a tool's input: a fixed value, or a function of the input. */
type FromInput<Input, T> = T | ((input: Input) => T)

const fromInput = <Input, T>(option: FromInput<Input, T> | undefined, input: Input) =>
  typeof option === 'function' ? (option as (input: Input) => T)(input) : option

/**
 * A tool entry for `tools` that asks with a form. With no `fields`, the model writes the form
 * itself: the tool's input is `{ title?, description?, fields: [{ name, label, type, … }] }`.
 * The answer is the field values (`toOutput` reshapes them); cancelling sends an error the model reads.
 */
function formTool<Input = unknown, Output = ToolFormValues>({
  label,
  display = 'inline',
  fields,
  title,
  description,
  submitLabel,
  cancellable = true,
  toOutput,
}: {
  label?: React.ReactNode
  /** 'inline' (default): the form stands in for the call. 'card': inside the folded card. */
  display?: 'card' | 'inline'
  /** The questions; by default, read from the input's `fields`. */
  fields?: FromInput<Input, readonly ToolFormField[]>
  /** By default, the input's `title`, then "The agent needs a few details". */
  title?: FromInput<Input, React.ReactNode>
  /** By default, the input's `description`. */
  description?: FromInput<Input, React.ReactNode>
  submitLabel?: React.ReactNode
  /** Offer Cancel (default true): the tool then fails with "The user cancelled the form." */
  cancellable?: boolean
  /** Shape the answer into the tool's output. The form shows the fields it finds by name in it. */
  toOutput?: (values: ToolFormValues, input: Input) => Output
} = {}): ToolComponent<Input, Output> {
  const read = (input: Input) => {
    const given = (input ?? {}) as { title?: unknown; description?: unknown; fields?: unknown }
    return {
      fields: fromInput(fields, input) ?? readToolFormFields(given.fields),
      title: fromInput(title, input) ?? str(given.title),
      description: fromInput(description, input) ?? str(given.description),
    }
  }
  return {
    label,
    display,
    awaitsInput: true,
    render(call) {
      // While the model is still writing the questions, the card says it's preparing.
      if (call.state === 'input-streaming') return undefined
      if (call.state === 'output-error' && call.input === undefined) return undefined
      const { fields: questions, title: heading, description: hint } = read(call.input as Input)
      const common = {
        fields: questions,
        title: heading,
        description: hint,
        submitLabel,
        // In the card, the card is the frame.
        className: display === 'card' ? 'max-w-none border-0 bg-transparent p-0' : undefined,
      }
      if (call.state === 'output-available') {
        const output = call.output as unknown
        const values =
          typeof output === 'object' && output !== null ? (output as Record<string, unknown>) : {}
        return <ToolForm {...common} values={values} />
      }
      if (call.state === 'output-error' || call.state === 'output-denied')
        return <ToolForm {...common} cancelled />
      const { submit, cancel } = call
      // Not wired to `onToolOutput`: keep the card, so the call doesn't offer a form that goes nowhere.
      if (!submit) return undefined
      return (
        <ToolForm
          {...common}
          onSubmit={(values) => {
            submit(toOutput ? toOutput(values, call.input) : (values as Output))
          }}
          onCancel={cancellable ? cancel : undefined}
        />
      )
    },
  }
}

export {
  formTool,
  readToolFormFields,
  ToolForm,
  type ToolFormError,
  type ToolFormField,
  type ToolFormValues,
  toolFormValues,
  validateToolForm,
}
