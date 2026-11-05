'use client'

// Coreloom UI — FormRenderer. Builds a form at runtime from a FormSpec, a JSON description of its
// sections and fields, using the Form fields (`useAppForm`). Use it when the form's shape comes from
// data: a settings page your server describes, a survey, a form made in the FormBuilder block.
//
//   const spec: FormSpec = {
//     version: 1,
//     title: 'Contact',
//     sections: [{ id: 'main', columns: 2, fields: [
//       { name: 'email', type: 'email', label: 'Email', required: true },
//       { name: 'topic', type: 'select', label: 'Topic', options: [{ value: 'sales', label: 'Sales' }] },
//       { name: 'company', type: 'text', label: 'Company', visibleWhen: { field: 'topic', op: 'equals', value: 'sales' } },
//     ] }],
//   }
//   <FormRenderer spec={spec} onSubmit={(values) => save(values)} />
//
// A spec received from elsewhere is untrusted: read it with `readFormSpec` first. Field types live in
// `formFieldTypes`; pass `types={{ ...formFieldTypes, mine }}` to add your own. `fromJSONSchema` turns a
// JSON Schema (and a react-jsonschema-form style UI schema) into a FormSpec; `toJSONSchema` goes back.
import {
  AlignLeftIcon,
  ArrowLeftRightIcon,
  ArrowRightLeftIcon,
  AtSignIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarFoldIcon,
  CalendarIcon,
  CalendarRangeIcon,
  ChevronsUpDownIcon,
  CircleDotIcon,
  Clock3Icon,
  ClockIcon,
  CoinsIcon,
  CreditCardIcon,
  FileJsonIcon,
  GalleryHorizontalIcon,
  GaugeIcon,
  GlobeIcon,
  HashIcon,
  ImageIcon,
  KeyRoundIcon,
  LayoutListIcon,
  LinkIcon,
  ListChecksIcon,
  ListOrderedIcon,
  ListTodoIcon,
  ListTreeIcon,
  type LucideIcon,
  MessageSquareIcon,
  PaletteIcon,
  PaperclipIcon,
  PhoneIcon,
  RectangleEllipsisIcon,
  RepeatIcon,
  RulerIcon,
  SlidersHorizontalIcon,
  SquareCheckIcon,
  StarIcon,
  TableIcon,
  TagIcon,
  TagsIcon,
  TextSearchIcon,
  TimerIcon,
  ToggleRightIcon,
  TypeIcon,
} from 'lucide-react'
import * as React from 'react'

import type { DateRange } from '@/components/ui/date-range-picker'
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field'
import {
  CheckboxField,
  CheckboxGroupField,
  ChipField,
  ColorField,
  ComboboxField,
  DateField,
  DateRangeField,
  DateTimeField,
  DurationField,
  FileField,
  ImageField,
  JsonField,
  KeyValueField,
  MaskedField,
  MentionField,
  MoneyField,
  MonthField,
  MultiSelectField,
  NumberField,
  NumberRangeField,
  OTPField,
  PasswordField,
  PhoneField,
  RadioCardField,
  RadioGroupField,
  RatingField,
  RecurrenceField,
  ScaleField,
  SegmentedField,
  SelectField,
  SliderField,
  SortableField,
  SwitchField,
  TagsField,
  TextareaField,
  TextField,
  TimeField,
  TimeRangeField,
  TimezoneField,
  TransferField,
  TreeSelectField,
  UnitField,
  useAppForm,
  WeekField,
} from '@/components/ui/form'
import { parseJson } from '@/components/ui/json-input'
import { isValidPhone } from '@/components/ui/phone-input'
import { useCoreloomI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------------------------------
// The format
// ---------------------------------------------------------------------------------------------------

/** One choice of a select, radio or multi-select field. */
interface FormOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
  /** Sub-options, for a tree select. */
  children?: FormOption[]
}

/** How a condition compares the other field's value. */
type FormConditionOp = 'equals' | 'notEquals' | 'in' | 'filled' | 'empty' | 'gt' | 'lt' | 'contains'

/**
 * When a field shows: `{ field, op, value }` compares another field's value (as submitted),
 * `{ all: [...] }` and `{ any: [...] }` combine conditions. A hidden field isn't checked or submitted.
 */
type FormCondition =
  | { field: string; op: FormConditionOp; value?: unknown }
  | { all: FormCondition[] }
  | { any: FormCondition[] }

/**
 * One field. `type` picks the control (see `formFieldTypes`); the settings a type reads (`currency`,
 * `min`, `options`, `accept`…) sit next to the common keys, flat, so a field reads like its props.
 */
interface FormFieldSpec {
  /** The key in the submitted values: letters, digits, `_` or `-`, starting with a letter or `_`. */
  name: string
  type: string
  label: string
  /** Help text under the field. */
  description?: string
  placeholder?: string
  required?: boolean
  /** As submitted: "YYYY-MM-DD" for a date, a number for a number, string[] for a multi-select… */
  defaultValue?: unknown
  /** Columns this field takes in its section's grid (1 by default). */
  span?: 1 | 2 | 3
  visibleWhen?: FormCondition
  minLength?: number
  maxLength?: number
  /** A regular expression the whole value must match, e.g. "[A-Z]{2}\\d{4}". */
  pattern?: string
  /** Shown when `pattern` doesn't match (default: a generic message). */
  patternMessage?: string
  /** Numbers, or "YYYY-MM-DD" / "HH:mm" bounds for dates and times. */
  min?: number | string
  max?: number | string
  minItems?: number
  maxItems?: number
  options?: FormOption[]
  [setting: string]: unknown
}

interface FormSectionSpec {
  /** Unique in the form. */
  id: string
  title?: string
  description?: string
  /** Fields per row from a medium width up (1 by default). */
  columns?: 1 | 2 | 3
  fields: FormFieldSpec[]
}

/** A form as data: what FormRenderer draws and FormBuilder edits. */
interface FormSpec {
  version: 1
  title?: string
  description?: string
  submitLabel?: string
  sections: FormSectionSpec[]
}

/** The submitted values by field name, as JSON (except files, which stay `File[]`). */
type FormValues = Record<string, unknown>

// ---------------------------------------------------------------------------------------------------
// Field types
// ---------------------------------------------------------------------------------------------------

/** A setting the FormBuilder's inspector offers for a type. Its label comes from the i18n messages. */
interface FormFieldSetting {
  key: string
  /** `list` is a string[] (typed comma-separated in the builder). */
  kind: 'text' | 'number' | 'boolean' | 'select' | 'list'
  /** For `select`. */
  choices?: readonly { value: string; label: string }[]
}

/** Which checks the FormBuilder offers for a type (they run on any type, from the value's shape). */
type FormFieldCheck = 'length' | 'pattern' | 'range' | 'dateRange' | 'timeRange' | 'items'

interface FormFieldType {
  /** The key fields use in `type`. */
  type: string
  /** The name shown in the builder when the i18n messages have none for this type. */
  label: string
  icon: LucideIcon
  /** Where the builder's palette lists it. */
  group: 'text' | 'number' | 'choice' | 'date' | 'other'
  /** The control's value when nothing is entered. */
  empty: unknown
  /** The empty value when it depends on the field's settings (a single or multiple pick). */
  emptyOf?: (field: FormFieldSpec) => unknown
  /** Whether a submitted value counts as not filled in, when "", null, [] and false aren't enough. */
  isEmpty?: (value: unknown, field: FormFieldSpec) => boolean
  /** The input the builder shows for a `dateRange` check's bounds (default "date"). */
  rangeInput?: 'date' | 'month' | 'week'
  /** The field draws its label beside the control (checkbox, switch): no "optional" mark. */
  inline?: boolean
  /** It picks from `options`. */
  hasOptions?: boolean
  placeholder?: boolean
  settings?: readonly FormFieldSetting[]
  checks?: readonly FormFieldCheck[]
  /** The control, inside `form.AppField`. `label` already carries the "optional" mark. */
  render: (field: FormFieldSpec, label: React.ReactNode) => React.ReactNode
  /** Submitted (JSON) value → the control's value. */
  fromJSON?: (value: unknown, field: FormFieldSpec) => unknown
  /** The control's value → the submitted value. */
  toJSON?: (value: unknown, field: FormFieldSpec) => unknown
  /** A check of its own, on the submitted value once it's filled in. */
  validate?: (value: unknown, field: FormFieldSpec) => FormFieldError | undefined
}

type FormFieldTypes = Record<string, FormFieldType>

/** What's wrong with a value: the locale turns it into a sentence. */
type FormFieldError =
  | { type: 'required' | 'checked' | 'email' | 'url' | 'phone' | 'pattern' | 'json' }
  | {
      type: 'minLength' | 'maxLength' | 'min' | 'max' | 'minItems' | 'maxItems'
      limit: number | string
    }
  | { type: 'dateMin' | 'dateMax' | 'timeMin' | 'timeMax'; limit: string }
  | { type: 'custom'; message: string }

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const bool = (v: unknown) => v === true

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^\d{2}:\d{2}$/
const pad = (n: number) => String(n).padStart(2, '0')

/** "YYYY-MM-DD" ↔ a local Date. */
function dateToJSON(value: unknown) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}
function dateFromJSON(value: unknown) {
  if (typeof value !== 'string' || !DATE.test(value)) return undefined
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}
/** "YYYY-MM-DDTHH:mm" (local time, no zone) ↔ a Date. */
function dateTimeToJSON(value: unknown) {
  const day = dateToJSON(value)
  return day && value instanceof Date
    ? `${day}T${pad(value.getHours())}:${pad(value.getMinutes())}`
    : null
}
function dateTimeFromJSON(value: unknown) {
  if (typeof value !== 'string') return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

const options = (field: FormFieldSpec) => field.options ?? []
const strings = (v: unknown) =>
  Array.isArray(v) && v.length ? v.filter((x): x is string => typeof x === 'string') : undefined

interface TreeOption {
  value: string
  label: string
  disabled?: boolean
  children?: TreeOption[]
}
function toTree(list: FormOption[]): TreeOption[] {
  return list.map((o) => ({
    value: o.value,
    label: o.label,
    ...(o.disabled ? { disabled: true } : {}),
    ...(o.children?.length ? { children: toTree(o.children) } : {}),
  }))
}
const commonProps = (field: FormFieldSpec, label: React.ReactNode) => ({
  label,
  description: field.description,
})

function isWebAddress(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

const textChecks = ['length', 'pattern'] as const

/** The built-in field types: one per Form field. */
const formFieldTypes: FormFieldTypes = {
  text: {
    type: 'text',
    label: 'Text',
    icon: TypeIcon,
    group: 'text',
    empty: '',
    placeholder: true,
    settings: [{ key: 'maxCount', kind: 'number' }],
    checks: textChecks,
    render: (f, label) => (
      <TextField
        {...commonProps(f, label)}
        placeholder={f.placeholder}
        maxCount={num(f.maxCount)}
      />
    ),
  },
  email: {
    type: 'email',
    label: 'Email',
    icon: AtSignIcon,
    group: 'text',
    empty: '',
    placeholder: true,
    checks: textChecks,
    render: (f, label) => (
      <TextField
        {...commonProps(f, label)}
        type="email"
        autoComplete="email"
        placeholder={f.placeholder}
      />
    ),
    validate: (v) =>
      typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : { type: 'email' },
  },
  url: {
    type: 'url',
    label: 'Web address',
    icon: LinkIcon,
    group: 'text',
    empty: '',
    placeholder: true,
    checks: textChecks,
    render: (f, label) => (
      <TextField {...commonProps(f, label)} type="url" placeholder={f.placeholder} />
    ),
    validate: (v) => (typeof v === 'string' && isWebAddress(v) ? undefined : { type: 'url' }),
  },
  textarea: {
    type: 'textarea',
    label: 'Long text',
    icon: AlignLeftIcon,
    group: 'text',
    empty: '',
    placeholder: true,
    settings: [
      { key: 'rows', kind: 'number' },
      { key: 'maxCount', kind: 'number' },
    ],
    checks: textChecks,
    render: (f, label) => (
      <TextareaField
        {...commonProps(f, label)}
        placeholder={f.placeholder}
        rows={num(f.rows)}
        maxCount={num(f.maxCount)}
      />
    ),
  },
  password: {
    type: 'password',
    label: 'Password',
    icon: KeyRoundIcon,
    group: 'text',
    empty: '',
    placeholder: true,
    checks: textChecks,
    render: (f, label) => (
      <PasswordField
        {...commonProps(f, label)}
        autoComplete="new-password"
        placeholder={f.placeholder}
      />
    ),
  },
  phone: {
    type: 'phone',
    label: 'Phone',
    icon: PhoneIcon,
    group: 'text',
    empty: '',
    placeholder: true,
    settings: [{ key: 'defaultCountry', kind: 'text' }],
    render: (f, label) => (
      <PhoneField
        {...commonProps(f, label)}
        placeholder={f.placeholder}
        defaultCountry={str(f.defaultCountry)}
      />
    ),
    validate: (v) => (typeof v === 'string' && isValidPhone(v) ? undefined : { type: 'phone' }),
  },
  otp: {
    type: 'otp',
    label: 'One-time code',
    icon: RectangleEllipsisIcon,
    group: 'text',
    empty: '',
    settings: [{ key: 'length', kind: 'number' }],
    render: (f, label) => <OTPField {...commonProps(f, label)} length={num(f.length) ?? 6} />,
  },
  number: {
    type: 'number',
    label: 'Number',
    icon: HashIcon,
    group: 'number',
    empty: null,
    placeholder: true,
    settings: [
      { key: 'step', kind: 'number' },
      {
        key: 'stepper',
        kind: 'select',
        choices: [
          { value: 'end', label: 'end' },
          { value: 'sides', label: 'sides' },
          { value: 'none', label: 'none' },
        ],
      },
    ],
    checks: ['range'],
    render: (f, label) => (
      <NumberField
        {...commonProps(f, label)}
        placeholder={f.placeholder}
        min={num(f.min)}
        max={num(f.max)}
        step={num(f.step)}
        stepper={
          f.stepper === 'sides' || f.stepper === 'none' || f.stepper === 'end'
            ? f.stepper
            : undefined
        }
      />
    ),
  },
  money: {
    type: 'money',
    label: 'Amount',
    icon: CoinsIcon,
    group: 'number',
    empty: null,
    placeholder: true,
    settings: [
      { key: 'currency', kind: 'text' },
      { key: 'allowNegative', kind: 'boolean' },
    ],
    checks: ['range'],
    render: (f, label) => (
      <MoneyField
        {...commonProps(f, label)}
        placeholder={f.placeholder}
        currency={str(f.currency) ?? 'EUR'}
        allowNegative={bool(f.allowNegative)}
        min={num(f.min)}
        max={num(f.max)}
      />
    ),
  },
  select: {
    type: 'select',
    label: 'Select',
    icon: ChevronsUpDownIcon,
    group: 'choice',
    empty: '',
    hasOptions: true,
    placeholder: true,
    render: (f, label) => (
      <SelectField {...commonProps(f, label)} options={options(f)} placeholder={f.placeholder} />
    ),
  },
  combobox: {
    type: 'combobox',
    label: 'Searchable select',
    icon: TextSearchIcon,
    group: 'choice',
    empty: '',
    hasOptions: true,
    placeholder: true,
    render: (f, label) => (
      <ComboboxField
        {...commonProps(f, label)}
        options={options(f)}
        placeholder={f.placeholder}
        clearable={!f.required}
      />
    ),
  },
  radio: {
    type: 'radio',
    label: 'Radio buttons',
    icon: CircleDotIcon,
    group: 'choice',
    empty: '',
    hasOptions: true,
    render: (f, label) => <RadioGroupField {...commonProps(f, label)} options={options(f)} />,
  },
  multiselect: {
    type: 'multiselect',
    label: 'Multi-select',
    icon: ListChecksIcon,
    group: 'choice',
    empty: [],
    hasOptions: true,
    placeholder: true,
    checks: ['items'],
    render: (f, label) => (
      <MultiSelectField
        {...commonProps(f, label)}
        options={options(f)}
        placeholder={f.placeholder}
        maxSelected={num(f.maxItems)}
      />
    ),
  },
  tags: {
    type: 'tags',
    label: 'Tags',
    icon: TagsIcon,
    group: 'choice',
    empty: [],
    placeholder: true,
    checks: ['items'],
    render: (f, label) => (
      <TagsField {...commonProps(f, label)} placeholder={f.placeholder} maxTags={num(f.maxItems)} />
    ),
  },
  checkbox: {
    type: 'checkbox',
    label: 'Checkbox',
    icon: SquareCheckIcon,
    group: 'choice',
    empty: false,
    inline: true,
    render: (f, label) => <CheckboxField {...commonProps(f, label)} />,
  },
  switch: {
    type: 'switch',
    label: 'Switch',
    icon: ToggleRightIcon,
    group: 'choice',
    empty: false,
    inline: true,
    render: (f, label) => <SwitchField {...commonProps(f, label)} />,
  },
  date: {
    type: 'date',
    label: 'Date',
    icon: CalendarIcon,
    group: 'date',
    empty: undefined,
    placeholder: true,
    settings: [{ key: 'typing', kind: 'boolean' }],
    checks: ['dateRange'],
    render: (f, label) => {
      const min = dateFromJSON(f.min)
      const max = dateFromJSON(f.max)
      return (
        <DateField
          {...commonProps(f, label)}
          placeholder={f.placeholder}
          typing={bool(f.typing)}
          calendarProps={{
            disabled: [...(min ? [{ before: min }] : []), ...(max ? [{ after: max }] : [])],
          }}
        />
      )
    },
    fromJSON: dateFromJSON,
    toJSON: dateToJSON,
  },
  daterange: {
    type: 'daterange',
    label: 'Date range',
    icon: CalendarRangeIcon,
    group: 'date',
    empty: undefined,
    placeholder: true,
    render: (f, label) => <DateRangeField {...commonProps(f, label)} placeholder={f.placeholder} />,
    fromJSON: (v) => {
      if (typeof v !== 'object' || v === null) return undefined
      const r = v as { from?: unknown; to?: unknown }
      const from = dateFromJSON(r.from)
      return from ? { from, to: dateFromJSON(r.to) } : undefined
    },
    toJSON: (v) => {
      const r = v as DateRange | undefined
      const from = dateToJSON(r?.from)
      return from ? { from, to: dateToJSON(r?.to) } : null
    },
  },
  time: {
    type: 'time',
    label: 'Time',
    icon: ClockIcon,
    group: 'date',
    empty: undefined,
    placeholder: true,
    settings: [{ key: 'step', kind: 'number' }],
    checks: ['timeRange'],
    render: (f, label) => (
      <TimeField
        {...commonProps(f, label)}
        placeholder={f.placeholder}
        step={num(f.step)}
        min={typeof f.min === 'string' && TIME.test(f.min) ? f.min : undefined}
        max={typeof f.max === 'string' && TIME.test(f.max) ? f.max : undefined}
      />
    ),
  },
  datetime: {
    type: 'datetime',
    label: 'Date and time',
    icon: CalendarClockIcon,
    group: 'date',
    empty: undefined,
    render: (f, label) => <DateTimeField {...commonProps(f, label)} />,
    fromJSON: dateTimeFromJSON,
    toJSON: dateTimeToJSON,
  },
  masked: {
    type: 'masked',
    label: 'Masked number',
    icon: CreditCardIcon,
    group: 'text',
    empty: '',
    placeholder: true,
    settings: [
      {
        key: 'preset',
        kind: 'select',
        choices: [
          { value: 'iban', label: 'IBAN' },
          { value: 'card', label: 'Card' },
          { value: 'siren', label: 'SIREN' },
          { value: 'siret', label: 'SIRET' },
        ],
      },
    ],
    render: (f, label) => (
      <MaskedField
        {...commonProps(f, label)}
        placeholder={f.placeholder}
        preset={
          f.preset === 'card' || f.preset === 'siren' || f.preset === 'siret' ? f.preset : 'iban'
        }
      />
    ),
  },
  mention: {
    type: 'mention',
    label: 'Text with mentions',
    icon: MessageSquareIcon,
    group: 'text',
    empty: '',
    placeholder: true,
    hasOptions: true,
    settings: [
      { key: 'trigger', kind: 'text' },
      { key: 'rows', kind: 'number' },
    ],
    checks: ['length'],
    render: (f, label) => (
      <MentionField
        {...commonProps(f, label)}
        placeholder={f.placeholder}
        options={options(f).map((o) => ({ value: o.value, label: o.label }))}
        trigger={str(f.trigger)}
        rows={num(f.rows)}
      />
    ),
  },
  json: {
    type: 'json',
    label: 'JSON',
    icon: FileJsonIcon,
    group: 'other',
    empty: '',
    placeholder: true,
    settings: [
      { key: 'rows', kind: 'number' },
      { key: 'formatOnBlur', kind: 'boolean' },
    ],
    render: (f, label) => (
      <JsonField
        {...commonProps(f, label)}
        placeholder={f.placeholder}
        rows={num(f.rows)}
        formatOnBlur={bool(f.formatOnBlur)}
      />
    ),
    validate: (v) => (typeof v === 'string' && parseJson(v).ok ? undefined : { type: 'json' }),
  },
  rating: {
    type: 'rating',
    label: 'Rating',
    icon: StarIcon,
    group: 'number',
    empty: 0,
    settings: [{ key: 'max', kind: 'number' }],
    render: (f, label) => <RatingField {...commonProps(f, label)} max={num(f.max)} />,
    // 0 stars is no score.
    isEmpty: (v) => v === 0,
  },
  slider: {
    type: 'slider',
    label: 'Slider',
    icon: SlidersHorizontalIcon,
    group: 'number',
    empty: undefined,
    emptyOf: (f) => num(f.min) ?? 0,
    settings: [{ key: 'step', kind: 'number' }],
    checks: ['range'],
    // Its label also names the slider, so it stays plain text.
    render: (f) => (
      <SliderField
        label={f.label}
        description={f.description}
        min={num(f.min)}
        max={num(f.max)}
        step={num(f.step)}
      />
    ),
  },
  scale: {
    type: 'scale',
    label: 'Scale',
    icon: GaugeIcon,
    group: 'number',
    empty: null,
    settings: [
      { key: 'minLabel', kind: 'text' },
      { key: 'maxLabel', kind: 'text' },
      { key: 'labels', kind: 'list' },
    ],
    checks: ['range'],
    render: (f, label) => (
      <ScaleField
        {...commonProps(f, label)}
        min={num(f.min)}
        max={num(f.max)}
        minLabel={str(f.minLabel)}
        maxLabel={str(f.maxLabel)}
        labels={strings(f.labels)}
      />
    ),
  },
  unit: {
    type: 'unit',
    label: 'Number with unit',
    icon: RulerIcon,
    group: 'number',
    empty: undefined,
    emptyOf: (f) => ({ value: null, unit: strings(f.units)?.[0] ?? '' }),
    placeholder: true,
    settings: [
      { key: 'units', kind: 'list' },
      { key: 'step', kind: 'number' },
    ],
    render: (f, label) => (
      <UnitField
        {...commonProps(f, label)}
        placeholder={f.placeholder}
        units={(strings(f.units) ?? []).map((u) => ({ value: u }))}
        step={num(f.step)}
      />
    ),
    isEmpty: (v) => isRecord(v) && v.value === null,
  },
  numberrange: {
    type: 'numberrange',
    label: 'Number range',
    icon: ArrowLeftRightIcon,
    group: 'number',
    empty: undefined,
    settings: [{ key: 'step', kind: 'number' }],
    render: (f, label) => (
      <NumberRangeField
        {...commonProps(f, label)}
        min={num(f.min)}
        max={num(f.max)}
        step={num(f.step)}
      />
    ),
    isEmpty: (v) => isRecord(v) && v.min == null && v.max == null,
  },
  segmented: {
    type: 'segmented',
    label: 'Segmented control',
    icon: GalleryHorizontalIcon,
    group: 'choice',
    empty: '',
    hasOptions: true,
    render: (f, label) => <SegmentedField {...commonProps(f, label)} options={options(f)} />,
  },
  radiocards: {
    type: 'radiocards',
    label: 'Choice cards',
    icon: LayoutListIcon,
    group: 'choice',
    empty: '',
    hasOptions: true,
    settings: [
      {
        key: 'orientation',
        kind: 'select',
        choices: [
          { value: 'vertical', label: 'vertical' },
          { value: 'horizontal', label: 'horizontal' },
        ],
      },
    ],
    render: (f, label) => (
      <RadioCardField
        {...commonProps(f, label)}
        orientation={f.orientation === 'horizontal' ? 'horizontal' : 'vertical'}
        options={options(f).map((o) => ({
          value: o.value,
          title: o.label,
          description: o.description,
          disabled: o.disabled,
        }))}
      />
    ),
  },
  checkboxes: {
    type: 'checkboxes',
    label: 'Checkbox group',
    icon: ListTodoIcon,
    group: 'choice',
    empty: [],
    hasOptions: true,
    checks: ['items'],
    render: (f, label) => <CheckboxGroupField {...commonProps(f, label)} options={options(f)} />,
  },
  chips: {
    type: 'chips',
    label: 'Chips',
    icon: TagIcon,
    group: 'choice',
    empty: [],
    emptyOf: (f) => (f.single === true ? '' : []),
    hasOptions: true,
    settings: [{ key: 'single', kind: 'boolean' }],
    checks: ['items'],
    render: (f, label) => (
      <ChipField
        {...commonProps(f, label)}
        options={options(f)}
        type={f.single === true ? 'single' : 'multiple'}
      />
    ),
  },
  treeselect: {
    type: 'treeselect',
    label: 'Tree select',
    icon: ListTreeIcon,
    group: 'choice',
    empty: '',
    emptyOf: (f) => (f.multiple === true ? [] : ''),
    hasOptions: true,
    placeholder: true,
    settings: [{ key: 'multiple', kind: 'boolean' }],
    checks: ['items'],
    render: (f, label) => (
      <TreeSelectField
        {...commonProps(f, label)}
        placeholder={f.placeholder}
        multiple={bool(f.multiple)}
        nodes={toTree(options(f))}
      />
    ),
  },
  transfer: {
    type: 'transfer',
    label: 'Transfer list',
    icon: ArrowRightLeftIcon,
    group: 'choice',
    empty: [],
    hasOptions: true,
    settings: [
      { key: 'availableLabel', kind: 'text' },
      { key: 'selectedLabel', kind: 'text' },
    ],
    checks: ['items'],
    render: (f, label) => (
      <TransferField
        {...commonProps(f, label)}
        options={options(f)}
        availableLabel={str(f.availableLabel)}
        selectedLabel={str(f.selectedLabel)}
      />
    ),
  },
  sortable: {
    type: 'sortable',
    label: 'Ranking',
    icon: ListOrderedIcon,
    group: 'choice',
    empty: undefined,
    hasOptions: true,
    settings: [{ key: 'numbered', kind: 'boolean' }],
    render: (f, label) => (
      <SortableField
        {...commonProps(f, label)}
        options={options(f).map((o) => ({
          value: o.value,
          label: o.label,
          description: o.description,
        }))}
        numbered={bool(f.numbered)}
      />
    ),
    // Untouched, the ranking is the options' own order.
    toJSON: (v, f) =>
      Array.isArray(v) && v.length ? (v as unknown[]) : options(f).map((o) => o.value),
  },
  month: {
    type: 'month',
    label: 'Month',
    icon: CalendarDaysIcon,
    group: 'date',
    empty: '',
    checks: ['dateRange'],
    rangeInput: 'month',
    render: (f, label) => (
      <MonthField {...commonProps(f, label)} min={str(f.min)} max={str(f.max)} />
    ),
  },
  week: {
    type: 'week',
    label: 'Week',
    icon: CalendarFoldIcon,
    group: 'date',
    empty: '',
    checks: ['dateRange'],
    rangeInput: 'week',
    render: (f, label) => <WeekField {...commonProps(f, label)} />,
  },
  timerange: {
    type: 'timerange',
    label: 'Time range',
    icon: Clock3Icon,
    group: 'date',
    empty: undefined,
    settings: [
      { key: 'step', kind: 'number' },
      { key: 'overnight', kind: 'boolean' },
    ],
    render: (f, label) => (
      <TimeRangeField
        {...commonProps(f, label)}
        step={num(f.step)}
        overnight={bool(f.overnight)}
        min={typeof f.min === 'string' && TIME.test(f.min) ? f.min : undefined}
        max={typeof f.max === 'string' && TIME.test(f.max) ? f.max : undefined}
      />
    ),
    isEmpty: (v) => isRecord(v) && !v.start && !v.end,
  },
  duration: {
    type: 'duration',
    label: 'Duration',
    icon: TimerIcon,
    group: 'date',
    empty: null,
    placeholder: true,
    checks: ['range'],
    render: (f, label) => <DurationField {...commonProps(f, label)} placeholder={f.placeholder} />,
  },
  recurrence: {
    type: 'recurrence',
    label: 'Recurrence',
    icon: RepeatIcon,
    group: 'date',
    empty: undefined,
    emptyOf: () => ({ frequency: 'week', interval: 1, weekdays: [1], end: { type: 'never' } }),
    settings: [{ key: 'frequencies', kind: 'list' }],
    render: (f, label) => (
      <RecurrenceField
        {...commonProps(f, label)}
        frequencies={strings(f.frequencies)?.filter((x): x is 'day' | 'week' | 'month' | 'year' =>
          ['day', 'week', 'month', 'year'].includes(x),
        )}
      />
    ),
  },
  timezone: {
    type: 'timezone',
    label: 'Time zone',
    icon: GlobeIcon,
    group: 'date',
    empty: '',
    placeholder: true,
    render: (f, label) => <TimezoneField {...commonProps(f, label)} placeholder={f.placeholder} />,
  },
  color: {
    type: 'color',
    label: 'Color',
    icon: PaletteIcon,
    group: 'other',
    empty: '',
    render: (f, label) => <ColorField {...commonProps(f, label)} />,
  },
  image: {
    type: 'image',
    label: 'Image',
    icon: ImageIcon,
    group: 'other',
    empty: null,
    settings: [
      {
        key: 'shape',
        kind: 'select',
        choices: [
          { value: 'square', label: 'square' },
          { value: 'circle', label: 'circle' },
          { value: 'wide', label: 'wide' },
        ],
      },
      { key: 'accept', kind: 'text' },
      { key: 'maxSize', kind: 'number' },
    ],
    render: (f, label) => (
      <ImageField
        {...commonProps(f, label)}
        shape={f.shape === 'circle' || f.shape === 'wide' ? f.shape : 'square'}
        accept={str(f.accept)}
        maxSize={num(f.maxSize)}
      />
    ),
  },
  keyvalue: {
    type: 'keyvalue',
    label: 'Key-value pairs',
    icon: TableIcon,
    group: 'other',
    empty: undefined,
    render: (f, label) => <KeyValueField {...commonProps(f, label)} />,
    // Rows without a key are left out.
    toJSON: (v) =>
      Array.isArray(v) ? (v as { key: string }[]).filter((row) => row.key.trim() !== '') : [],
  },
  file: {
    type: 'file',
    label: 'File',
    icon: PaperclipIcon,
    group: 'other',
    empty: [],
    settings: [
      { key: 'accept', kind: 'text' },
      { key: 'multiple', kind: 'boolean' },
      { key: 'maxSize', kind: 'number' },
    ],
    checks: ['items'],
    render: (f, label) => (
      <FileField
        {...commonProps(f, label)}
        accept={str(f.accept)}
        multiple={bool(f.multiple)}
        maxSize={num(f.maxSize)}
        maxFiles={num(f.maxItems)}
      />
    ),
    // Files can't come from JSON; they stay File objects in the submitted values.
    fromJSON: () => [],
  },
}

// ---------------------------------------------------------------------------------------------------
// Values, conditions and checks
// ---------------------------------------------------------------------------------------------------

/** Empty: nothing typed, nothing picked, unchecked. */
function isEmptyValue(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    value === false ||
    (Array.isArray(value) && value.length === 0)
  )
}

function emptyOf(type: FormFieldType | undefined, field: FormFieldSpec): unknown {
  return type?.emptyOf ? type.emptyOf(field) : type?.empty
}

/** Whether a submitted value counts as not filled in, for its type. */
function isEmptyFor(type: FormFieldType | undefined, field: FormFieldSpec, value: unknown) {
  return isEmptyValue(value) || (type?.isEmpty?.(value, field) ?? false)
}

/** The value a field submits, as JSON: empty optional fields become null (lists stay [], toggles false). */
function toSubmitted(field: FormFieldSpec, value: unknown, types: FormFieldTypes): unknown {
  const type = types[field.type] as FormFieldType | undefined
  const json = type?.toJSON ? type.toJSON(value, field) : value
  const empty = emptyOf(type, field)
  if (Array.isArray(empty)) return Array.isArray(json) ? json : []
  if (empty === false) return json === true
  return isEmptyFor(type, field, json) ? null : json
}

type ConditionTest = (actual: unknown, expected: unknown) => boolean

const contains: ConditionTest = (actual, expected) =>
  Array.isArray(actual)
    ? actual.includes(expected)
    : typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected)

/** What each operator checks. `gt` and `lt` compare values of the same type only. */
const CONDITION_TESTS = new Map<FormConditionOp, ConditionTest>([
  ['equals', (a, e) => (Array.isArray(a) ? a.includes(e) : a === e)],
  ['notEquals', (a, e) => (Array.isArray(a) ? !a.includes(e) : a !== e)],
  ['in', (a, e) => Array.isArray(e) && e.includes(a)],
  ['filled', (a) => !isEmptyValue(a)],
  ['empty', (a) => isEmptyValue(a)],
  ['gt', (a, e) => typeof a === typeof e && (a as number) > (e as number)],
  ['lt', (a, e) => typeof a === typeof e && (a as number) < (e as number)],
  ['contains', contains],
])

/** Whether `condition` holds for these submitted values. Missing or broken conditions hold. */
function evaluateCondition(condition: FormCondition | undefined, values: FormValues): boolean {
  if (!condition) return true
  if ('all' in condition) return condition.all.every((c) => evaluateCondition(c, values))
  if ('any' in condition)
    return condition.any.length === 0 || condition.any.some((c) => evaluateCondition(c, values))
  const test = CONDITION_TESTS.get(condition.op)
  return test ? test(values[condition.field], condition.value) : true
}

function allFields(spec: FormSpec) {
  return spec.sections.flatMap((s) => s.fields)
}

/** Every field's submitted value, hidden ones included (conditions read them). */
function submittedValues(spec: FormSpec, values: FormValues, types: FormFieldTypes): FormValues {
  return Object.fromEntries(
    allFields(spec).map((f) => [f.name, toSubmitted(f, values[f.name], types)]),
  )
}

/** Whether a field shows. A condition on a hidden field holds only if that field would, too. */
function isFieldVisible(
  spec: FormSpec,
  name: string,
  submitted: FormValues,
  seen = new Set<string>(),
): boolean {
  const field = allFields(spec).find((f) => f.name === name)
  if (!field?.visibleWhen || seen.has(name)) return true
  seen.add(name)
  const refs = conditionFields(field.visibleWhen)
  return (
    evaluateCondition(field.visibleWhen, submitted) &&
    refs.every((r) => isFieldVisible(spec, r, submitted, seen))
  )
}

function conditionFields(condition: FormCondition): string[] {
  if ('all' in condition) return condition.all.flatMap(conditionFields)
  if ('any' in condition) return condition.any.flatMap(conditionFields)
  return [condition.field]
}

/** What the form submits: the visible fields, as JSON. */
function formSpecValues(spec: FormSpec, values: FormValues, types = formFieldTypes): FormValues {
  const submitted = submittedValues(spec, values, types)
  return Object.fromEntries(
    allFields(spec)
      .filter((f) => isFieldVisible(spec, f.name, submitted))
      .map((f) => [f.name, submitted[f.name]]),
  )
}

/** The form's starting values (the controls' shape): `defaultValues` (JSON) win over the spec's. */
function initialFormValues(
  spec: FormSpec,
  types: FormFieldTypes = formFieldTypes,
  defaultValues: FormValues = {},
): FormValues {
  return Object.fromEntries(
    allFields(spec).map((f) => {
      const type = types[f.type] as FormFieldType | undefined
      const json = f.name in defaultValues ? defaultValues[f.name] : f.defaultValue
      if (json === undefined || json === null) return [f.name, emptyOf(type, f)]
      return [f.name, type?.fromJSON ? type.fromJSON(json, f) : json]
    }),
  )
}

const patternCache = new Map<string, RegExp | null>()
function compilePattern(source: string) {
  if (!patternCache.has(source)) {
    try {
      patternCache.set(source, new RegExp(`^(?:${source})$`, 'u'))
    } catch {
      patternCache.set(source, null)
    }
  }
  return patternCache.get(source) ?? null
}

function checkTextRange(
  field: FormFieldSpec,
  value: string,
  kind: 'date' | 'time',
): FormFieldError | undefined {
  if (typeof field.min === 'string' && value < field.min)
    return { type: `${kind}Min`, limit: field.min }
  if (typeof field.max === 'string' && value > field.max)
    return { type: `${kind}Max`, limit: field.max }
  return undefined
}

function checkLength(field: FormFieldSpec, length: number): FormFieldError | undefined {
  if (field.minLength !== undefined && length < field.minLength)
    return { type: 'minLength', limit: field.minLength }
  if (field.maxLength !== undefined && length > field.maxLength)
    return { type: 'maxLength', limit: field.maxLength }
  return undefined
}

function checkPattern(field: FormFieldSpec, value: string): FormFieldError | undefined {
  const re = field.pattern ? compilePattern(field.pattern) : null
  if (!re || re.test(value)) return undefined
  return field.patternMessage
    ? { type: 'custom', message: field.patternMessage }
    : { type: 'pattern' }
}

function checkText(
  field: FormFieldSpec,
  value: string,
  type: FormFieldType | undefined,
): FormFieldError | undefined {
  // Dates, months and weeks are ISO strings: they compare as text.
  if (type?.checks?.includes('dateRange')) return checkTextRange(field, value, 'date')
  if (TIME.test(value) && type?.checks?.includes('timeRange'))
    return checkTextRange(field, value, 'time')
  return checkLength(field, value.length) ?? checkPattern(field, value)
}

function checkNumber(field: FormFieldSpec, value: number): FormFieldError | undefined {
  if (typeof field.min === 'number' && value < field.min) return { type: 'min', limit: field.min }
  if (typeof field.max === 'number' && value > field.max) return { type: 'max', limit: field.max }
  return undefined
}

function checkItems(field: FormFieldSpec, value: unknown[]): FormFieldError | undefined {
  if (field.minItems !== undefined && value.length < field.minItems)
    return { type: 'minItems', limit: field.minItems }
  if (field.maxItems !== undefined && value.length > field.maxItems)
    return { type: 'maxItems', limit: field.maxItems }
  return undefined
}

/** The bounds that fit the value's shape: text, number or list. */
function checkBounds(
  field: FormFieldSpec,
  value: unknown,
  type: FormFieldType | undefined,
): FormFieldError | undefined {
  if (typeof value === 'string') return checkText(field, value, type)
  if (typeof value === 'number') return checkNumber(field, value)
  if (Array.isArray(value)) return checkItems(field, value)
  return undefined
}

/**
 * Checks one submitted value against its field: required, then the bounds that fit the value's shape
 * (length for text, min / max for numbers, dates and times, item counts for lists), then the type's own check.
 */
function checkFormField(
  field: FormFieldSpec,
  value: unknown,
  types: FormFieldTypes = formFieldTypes,
): FormFieldError | undefined {
  const type = types[field.type] as FormFieldType | undefined
  if (isEmptyFor(type, field, value)) {
    if (!field.required) return undefined
    return { type: emptyOf(type, field) === false ? 'checked' : 'required' }
  }
  return checkBounds(field, value, type) ?? type?.validate?.(value, field)
}

// ---------------------------------------------------------------------------------------------------
// Reading a spec from untrusted JSON
// ---------------------------------------------------------------------------------------------------

/** Something `readFormSpec` fixed or dropped, with where (`sections[0].fields[2]`). */
interface FormSpecIssue {
  path: string
  code:
    | 'notObject'
    | 'missingName'
    | 'duplicateName'
    | 'unknownType'
    | 'noOptions'
    | 'badCondition'
    | 'tooMany'
  detail?: string
}

const NAME = /^[A-Za-z_][\w-]{0,63}$/
const MAX_FIELDS = 200
const OPS = new Set(CONDITION_TESTS.keys())
const COMMON_KEYS = new Set([
  'name',
  'type',
  'label',
  'description',
  'placeholder',
  'required',
  'defaultValue',
  'span',
  'visibleWhen',
  'minLength',
  'maxLength',
  'pattern',
  'patternMessage',
  'min',
  'max',
  'minItems',
  'maxItems',
  'options',
])

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const count = (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined
const columnsOf = (v: unknown) => (v === 2 || v === 3 ? v : v === 1 ? 1 : undefined)
const isJSONScalar = (v: unknown) =>
  v === null || ['string', 'number', 'boolean'].includes(typeof v)

const isConditionValue = (v: unknown) =>
  isJSONScalar(v) || (Array.isArray(v) && v.every(isJSONScalar))

function readConditions(list: unknown[], depth: number): FormCondition[] {
  return list
    .map((c) => readCondition(c, depth + 1))
    .filter((c): c is FormCondition => c !== undefined)
}

function readComparison(value: Record<string, unknown>): FormCondition | undefined {
  const field = str(value.field)
  const op = (str(value.op) ?? 'equals') as FormConditionOp
  if (!field || !OPS.has(op)) return undefined
  if (value.value === undefined) return { field, op }
  return isConditionValue(value.value) ? { field, op, value: value.value } : undefined
}

function readCondition(value: unknown, depth = 0): FormCondition | undefined {
  if (!isRecord(value) || depth > 4) return undefined
  if (Array.isArray(value.all)) return { all: readConditions(value.all, depth) }
  if (Array.isArray(value.any)) return { any: readConditions(value.any, depth) }
  return readComparison(value)
}

/** One option: a non-empty string, or `{ value, label?, description?, disabled? }`. */
function readOption(o: unknown): FormOption | undefined {
  if (typeof o === 'string') return o ? { value: o, label: o } : undefined
  if (!isRecord(o) || (typeof o.value !== 'string' && typeof o.value !== 'number')) return undefined
  const description = str(o.description)
  return {
    value: String(o.value),
    label: str(o.label) ?? String(o.value),
    ...(description ? { description } : {}),
    ...(o.disabled === true ? { disabled: true } : {}),
  }
}

function readOptions(value: unknown, seen = new Set<string>(), depth = 0): FormOption[] {
  if (!Array.isArray(value) || depth > 5) return []
  return (value as unknown[]).flatMap((o): FormOption[] => {
    const option = readOption(o)
    if (!option || option.value === '' || seen.has(option.value)) return []
    seen.add(option.value)
    const children = isRecord(o) ? readOptions(o.children, seen, depth + 1) : []
    return [children.length ? { ...option, children } : option]
  })
}

/** What reading a spec keeps track of across sections: names and ids taken, fields read, issues. */
interface SpecReader {
  types: FormFieldTypes
  issues: FormSpecIssue[]
  names: Set<string>
  ids: Set<string>
  total: number
}

/** The field's name if it is usable, unique and under the field cap; otherwise says why not. */
function claimName(reader: SpecReader, raw: Record<string, unknown>, path: string) {
  const name = str(raw.name)
  if (!name || !NAME.test(name)) {
    reader.issues.push({ path, code: 'missingName', detail: name })
    return undefined
  }
  if (reader.names.has(name)) {
    reader.issues.push({ path, code: 'duplicateName', detail: name })
    return undefined
  }
  reader.total++
  if (reader.total > MAX_FIELDS) {
    if (reader.total === MAX_FIELDS + 1) reader.issues.push({ path, code: 'tooMany' })
    return undefined
  }
  reader.names.add(name)
  return name
}

function readFieldType(reader: SpecReader, raw: Record<string, unknown>, path: string) {
  const type = str(raw.type) ?? 'text'
  if (type in reader.types) return type
  reader.issues.push({ path, code: 'unknownType', detail: type })
  return 'text'
}

/** Type settings are kept as long as they are plain JSON scalars or lists of strings. */
const isTypeSetting = (v: unknown) =>
  (isJSONScalar(v) && v !== null) ||
  (Array.isArray(v) && v.length <= 500 && v.every((x) => typeof x === 'string'))

/** The common keys that need no checking beyond their shape. */
function readFieldKeys(field: FormFieldSpec, raw: Record<string, unknown>) {
  for (const key of ['description', 'placeholder', 'pattern', 'patternMessage'] as const)
    if (str(raw[key])) field[key] = str(raw[key])
  if (raw.required === true) field.required = true
  for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems'] as const)
    if (count(raw[key]) !== undefined) field[key] = count(raw[key])
  for (const key of ['min', 'max'] as const)
    if (num(raw[key]) !== undefined || str(raw[key])) field[key] = raw[key] as number | string
  const span = columnsOf(raw.span)
  if (span && span > 1) field.span = span
  if (raw.defaultValue !== undefined) field.defaultValue = raw.defaultValue
}

/** Options and the visibility condition: kept when usable, reported when not. */
function readFieldRules(
  reader: SpecReader,
  field: FormFieldSpec,
  raw: Record<string, unknown>,
  path: string,
) {
  if (reader.types[field.type].hasOptions) {
    field.options = readOptions(raw.options)
    if (!field.options.length) reader.issues.push({ path, code: 'noOptions', detail: field.name })
  }
  if (raw.visibleWhen === undefined) return
  const condition = readCondition(raw.visibleWhen)
  if (condition) field.visibleWhen = condition
  else reader.issues.push({ path, code: 'badCondition', detail: field.name })
}

function readField(reader: SpecReader, raw: unknown, path: string): FormFieldSpec | undefined {
  if (!isRecord(raw)) {
    reader.issues.push({ path, code: 'notObject' })
    return undefined
  }
  const name = claimName(reader, raw, path)
  if (!name) return undefined
  const type = readFieldType(reader, raw, path)
  const field: FormFieldSpec = { name, type, label: str(raw.label) ?? name }
  readFieldKeys(field, raw)
  readFieldRules(reader, field, raw, path)
  for (const [key, v] of Object.entries(raw))
    if (!COMMON_KEYS.has(key) && isTypeSetting(v)) field[key] = v
  return field
}

function readSection(
  reader: SpecReader,
  raw: unknown,
  index: number,
  path: string,
): FormSectionSpec | undefined {
  if (!isRecord(raw)) {
    reader.issues.push({ path, code: 'notObject' })
    return undefined
  }
  let id = str(raw.id) ?? `section-${index + 1}`
  while (reader.ids.has(id)) id = `${id}-${index + 1}`
  reader.ids.add(id)
  const section: FormSectionSpec = { id, fields: [] }
  for (const key of ['title', 'description'] as const)
    if (str(raw[key])) section[key] = str(raw[key])
  const columns = columnsOf(raw.columns)
  if (columns) section.columns = columns
  const rawFields = Array.isArray(raw.fields) ? (raw.fields as unknown[]) : []
  rawFields.forEach((rawField, fi) => {
    const field = readField(reader, rawField, `${path ? `${path}.` : ''}fields[${fi}]`)
    if (field) section.fields.push(field)
  })
  return section
}

/** `{ sections }`, or the one-section shorthand `{ fields }`. */
function rawSectionsOf(value: Record<string, unknown>): unknown[] {
  if (Array.isArray(value.sections)) return value.sections
  if (Array.isArray(value.fields)) return [{ id: 'main', fields: value.fields }]
  return []
}

/** A condition on a field that doesn't exist would hide its field forever: drop it. */
function dropDanglingConditions(spec: FormSpec, reader: SpecReader) {
  for (const field of allFields(spec))
    if (field.visibleWhen && conditionFields(field.visibleWhen).some((n) => !reader.names.has(n))) {
      delete field.visibleWhen
      reader.issues.push({ path: field.name, code: 'badCondition', detail: field.name })
    }
}

/**
 * Reads a FormSpec from untrusted JSON (a server's answer, a model's output, a pasted file): keeps what
 * is well formed, fixes what it can and says so in `issues`. Unknown types become text; fields without a
 * usable name are dropped; names are unique; at most 200 fields. `{ title, fields: [...] }` (one section,
 * as ToolForm takes) is accepted too.
 */
function readFormSpec(
  value: unknown,
  types: FormFieldTypes = formFieldTypes,
): { spec: FormSpec; issues: FormSpecIssue[] } {
  const reader: SpecReader = { types, issues: [], names: new Set(), ids: new Set(), total: 0 }
  const spec: FormSpec = { version: 1, sections: [] }
  if (!isRecord(value)) {
    reader.issues.push({ path: '', code: 'notObject' })
    return { spec, issues: reader.issues }
  }
  for (const key of ['title', 'description', 'submitLabel'] as const)
    if (str(value[key])) spec[key] = str(value[key])
  const listed = Array.isArray(value.sections)
  rawSectionsOf(value).forEach((raw, si) => {
    const section = readSection(reader, raw, si, listed ? `sections[${si}]` : '')
    if (section) spec.sections.push(section)
  })
  if (!spec.sections.length) spec.sections.push({ id: 'main', fields: [] })
  dropDanglingConditions(spec, reader)
  return { spec, issues: reader.issues }
}

// ---------------------------------------------------------------------------------------------------
// JSON Schema
// ---------------------------------------------------------------------------------------------------

type JSONSchema = Record<string, unknown>

const FORMATS: Record<string, string> = {
  email: 'email',
  uri: 'url',
  url: 'url',
  date: 'date',
  'date-time': 'datetime',
  time: 'time',
  password: 'password',
}
const WIDGETS: Record<string, string> = {
  textarea: 'textarea',
  password: 'password',
  radio: 'radio',
  select: 'select',
  checkbox: 'checkbox',
  checkboxes: 'multiselect',
  email: 'email',
  uri: 'url',
  date: 'date',
  'date-time': 'datetime',
  time: 'time',
  updown: 'number',
  range: 'number',
  file: 'file',
}

function schemaOptions(schema: JSONSchema): FormOption[] {
  if (Array.isArray(schema.enum))
    return readOptions(
      (schema.enum as unknown[]).map((v, i) => ({
        value: v,
        label: Array.isArray(schema.enumNames) ? (schema.enumNames as unknown[])[i] : v,
      })),
    )
  const list = Array.isArray(schema.oneOf) ? schema.oneOf : schema.anyOf
  if (Array.isArray(list))
    return readOptions(
      (list as unknown[]).filter(isRecord).map((o) => ({ value: o.const, label: o.title })),
    )
  return []
}

/** Property names in `ui:order` order; `*` stands for the ones it doesn't name. */
function orderedKeys(props: Record<string, unknown>, order: unknown[]) {
  const rest = order.indexOf('*')
  const rank = (key: string) => {
    const i = order.indexOf(key)
    if (i !== -1) return i
    return rest === -1 ? order.length : rest
  }
  return Object.keys(props).sort((a, b) => rank(a) - rank(b))
}

/** The field type a property maps to without a widget: by `type`, then options, then `format`. */
function schemaType(p: JSONSchema, hasOptions: boolean): string {
  if (p.type === 'boolean') return 'checkbox'
  if (p.type === 'number' || p.type === 'integer') return 'number'
  if (p.type === 'array') return hasOptions ? 'multiselect' : 'tags'
  if (hasOptions) return 'select'
  return FORMATS[str(p.format) ?? ''] ?? 'text'
}

/** A `ui:widget` wins: one of our type names, or theirs mapped to ours; unknown ones are ignored. */
function widgetType(widget: string | undefined, fallback: string, types: FormFieldTypes): string {
  if (!widget) return fallback
  return widget in types ? widget : (WIDGETS[widget] ?? fallback)
}

/** One property as raw field JSON (readFormSpec checks it afterwards). */
function schemaField(
  name: string,
  p: JSONSchema,
  ui: { pUi: Record<string, unknown>; required: boolean; types: FormFieldTypes },
): Record<string, unknown> {
  const items = isRecord(p.items) ? p.items : {}
  const opts = schemaOptions(p.type === 'array' ? items : p)
  const uiOptions = isRecord(ui.pUi['ui:options']) ? ui.pUi['ui:options'] : {}
  return {
    ...uiOptions,
    name,
    type: widgetType(str(ui.pUi['ui:widget']), schemaType(p, opts.length > 0), ui.types),
    label: str(p.title) ?? name,
    description: str(ui.pUi['ui:help']) ?? str(p.description),
    placeholder: str(ui.pUi['ui:placeholder']),
    required: ui.required || undefined,
    defaultValue: p.default,
    minLength: p.minLength,
    maxLength: p.maxLength,
    pattern: p.pattern,
    min: p.minimum ?? p.formatMinimum,
    max: p.maximum ?? p.formatMaximum,
    step: p.multipleOf ?? (p.type === 'integer' ? 1 : undefined),
    minItems: p.minItems,
    maxItems: p.maxItems,
    options: opts.length ? opts : undefined,
  }
}

/**
 * The fields of an object schema. Nested objects become sections, pushed to `sections` (the deepest
 * first), and their fields stay flat in the values.
 */
function schemaFields(
  obj: JSONSchema,
  objUi: Record<string, unknown>,
  ctx: { types: FormFieldTypes; sections: Record<string, unknown>[] },
): Record<string, unknown>[] {
  const props = isRecord(obj.properties) ? obj.properties : {}
  const required = new Set(Array.isArray(obj.required) ? (obj.required as unknown[]) : [])
  const order = Array.isArray(objUi['ui:order']) ? (objUi['ui:order'] as unknown[]) : []
  const fields: Record<string, unknown>[] = []
  for (const name of orderedKeys(props, order)) {
    const p = props[name]
    if (!isRecord(p)) continue
    const pUi = isRecord(objUi[name]) ? objUi[name] : {}
    if (p.type !== 'object') {
      fields.push(schemaField(name, p, { pUi, required: required.has(name), types: ctx.types }))
      continue
    }
    const nested = schemaFields(p, pUi, ctx)
    ctx.sections.push({
      id: name,
      title: str(p.title) ?? name,
      description: str(p.description),
      fields: nested,
    })
  }
  return fields
}

/**
 * Turns an object JSON Schema into a FormSpec: a field per property (strings by `format`, enums and
 * `oneOf` consts as selects, numbers, booleans, arrays as multi-selects or tags), `required`, titles,
 * descriptions, defaults and bounds. An optional UI schema (react-jsonschema-form style) sets
 * `ui:order`, `ui:widget` (theirs, or any of our type names), `ui:placeholder`, `ui:help`, `ui:options`.
 * Nested objects become sections; their fields stay flat in the values.
 */
function fromJSONSchema(
  schema: unknown,
  uiSchema: unknown = {},
  types: FormFieldTypes = formFieldTypes,
): { spec: FormSpec; issues: FormSpecIssue[] } {
  if (!isRecord(schema)) return readFormSpec(undefined, types)
  const sections: Record<string, unknown>[] = []
  const rootFields = schemaFields(schema, isRecord(uiSchema) ? uiSchema : {}, { types, sections })
  return readFormSpec(
    {
      title: schema.title,
      description: schema.description,
      sections: [
        ...(rootFields.length || !sections.length ? [{ id: 'main', fields: rootFields }] : []),
        ...sections,
      ],
    },
    types,
  )
}

const STRING_FORMATS: Record<string, string> = {
  email: 'email',
  url: 'uri',
  date: 'date',
  datetime: 'date-time',
  time: 'time',
}

const definedOnly = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined))

function stringSchema(f: FormFieldSpec, oneOf: JSONSchema[] | undefined): JSONSchema {
  return {
    type: 'string',
    ...(oneOf ? { oneOf } : {}),
    format: STRING_FORMATS[f.type],
    minLength: f.minLength,
    maxLength: f.maxLength,
    pattern: f.pattern,
    ...(typeof f.min === 'string' ? { formatMinimum: f.min } : {}),
    ...(typeof f.max === 'string' ? { formatMaximum: f.max } : {}),
  }
}

/** What one field submits, as a JSON Schema property (before its title and default). */
function valueSchema(f: FormFieldSpec): JSONSchema {
  const oneOf = f.options?.map((o) => ({ const: o.value, title: o.label }))
  switch (f.type) {
    case 'number':
    case 'money':
      return { type: 'number', minimum: f.min, maximum: f.max, multipleOf: f.step }
    case 'checkbox':
    case 'switch':
      return { type: 'boolean' }
    case 'multiselect':
    case 'tags':
      return {
        type: 'array',
        items: oneOf ? { oneOf } : { type: 'string' },
        minItems: f.minItems,
        maxItems: f.maxItems,
      }
    case 'daterange':
      return {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date' },
          to: { type: ['string', 'null'], format: 'date' },
        },
      }
    case 'file':
      return { type: 'array', items: { type: 'string', contentEncoding: 'binary' } }
    default:
      return stringSchema(f, oneOf)
  }
}

function fieldSchema(f: FormFieldSpec): JSONSchema {
  return definedOnly({
    title: f.label,
    ...(f.description ? { description: f.description } : {}),
    ...valueSchema(f),
    default: f.defaultValue,
  })
}

/** A JSON Schema (draft 2020-12) for what the form submits, plus the UI schema that rebuilds it. */
function toJSONSchema(spec: FormSpec): { schema: JSONSchema; uiSchema: Record<string, unknown> } {
  const fields = allFields(spec)
  const uiSchema: Record<string, unknown> = { 'ui:order': fields.map((f) => f.name) }
  for (const f of fields)
    uiSchema[f.name] = definedOnly({ 'ui:widget': f.type, 'ui:placeholder': f.placeholder })
  const required = fields.filter((f) => f.required).map((f) => f.name)
  return {
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      ...(spec.title ? { title: spec.title } : {}),
      ...(spec.description ? { description: spec.description } : {}),
      properties: Object.fromEntries(fields.map((f) => [f.name, fieldSchema(f)])),
      ...(required.length ? { required } : {}),
    },
    uiSchema,
  }
}

// ---------------------------------------------------------------------------------------------------
// The renderer
// ---------------------------------------------------------------------------------------------------

const GRID: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 @lg:grid-cols-2',
  3: 'grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3',
}
const SPAN: Record<number, string> = {
  1: '',
  2: '@lg:col-span-2',
  3: '@lg:col-span-2 @3xl:col-span-3',
}

/** The classes a field takes in a grid of `columns` (used by FormBuilder's canvas too). */
function fieldSpanClass(field: FormFieldSpec, columns = 1) {
  return SPAN[Math.min(field.span ?? 1, columns)]
}

interface FormRendererProps {
  spec: FormSpec
  /** Field types by key; defaults to `formFieldTypes`. */
  types?: FormFieldTypes
  /** Starting values (as submitted: dates as "YYYY-MM-DD"…), over the spec's `defaultValue`s. */
  defaultValues?: FormValues
  /** The visible fields' values, as JSON (files stay `File[]`). Return a promise to show a spinner. */
  onSubmit?: (values: FormValues) => void | Promise<void>
  /** Every change, as `onSubmit` would get them. */
  onValuesChange?: (values: FormValues) => void
  /** Over the spec's `submitLabel` (default "Submit"). */
  submitLabel?: React.ReactNode
  /** Leaves out the spec's title and description (when the page already shows them). */
  hideHeader?: boolean
  hideSubmit?: boolean
  /** Shows fields whose condition is false (FormBuilder's canvas). */
  showHidden?: boolean
  /** Wraps each field (FormBuilder's canvas makes them selectable). */
  renderField?: (field: FormFieldSpec, node: React.ReactNode, visible: boolean) => React.ReactNode
  /** Wraps each section's grid of fields. */
  renderSection?: (section: FormSectionSpec, node: React.ReactNode) => React.ReactNode
  className?: string
}

/** Draws a FormSpec as a form. A new spec starts the form over (fresh values). */
function FormRenderer(props: FormRendererProps) {
  // The fields, their order and their defaults all come from the spec: a changed spec is a new form.
  const key = React.useMemo(() => JSON.stringify(props.spec), [props.spec])
  return <SpecForm key={key} {...props} />
}

function SpecForm({
  spec,
  types = formFieldTypes,
  defaultValues,
  onSubmit,
  onValuesChange,
  submitLabel,
  hideHeader = false,
  hideSubmit = false,
  showHidden = false,
  renderField,
  renderSection,
  className,
}: FormRendererProps) {
  const { messages } = useCoreloomI18n()
  const t = messages.formRenderer
  const [initial] = React.useState(() => initialFormValues(spec, types, defaultValues))
  const form = useAppForm({
    defaultValues: initial,
    onSubmit: async ({ value }) => {
      await onSubmit?.(formSpecValues(spec, value, types))
    },
  })
  const headingId = React.useId()

  const errorText = (e: FormFieldError): string => {
    switch (e.type) {
      case 'custom':
        return e.message
      case 'minLength':
      case 'maxLength':
      case 'minItems':
      case 'maxItems':
      case 'min':
      case 'max':
        return t.errors[e.type](String(e.limit))
      case 'dateMin':
      case 'dateMax':
      case 'timeMin':
      case 'timeMax':
        return t.errors[e.type](e.limit)
      default:
        return t.errors[e.type]
    }
  }

  return (
    <form
      noValidate
      aria-labelledby={!hideHeader && spec.title ? headingId : undefined}
      className={cn('@container flex flex-col gap-6', className)}
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        void form.handleSubmit()
      }}
    >
      {!hideHeader && (spec.title ?? spec.description) && (
        <header className="flex flex-col gap-1">
          {spec.title && (
            <h2 id={headingId} className="font-display text-lg font-semibold text-foreground">
              {spec.title}
            </h2>
          )}
          {spec.description && (
            <p className="text-[13px] text-muted-foreground">{spec.description}</p>
          )}
        </header>
      )}
      {onValuesChange && (
        <form.Subscribe selector={(s) => s.values}>
          {(values) => (
            <ValuesListener
              values={formSpecValues(spec, values, types)}
              onChange={onValuesChange}
            />
          )}
        </form.Subscribe>
      )}
      <form.Subscribe selector={(s) => s.values}>
        {(values) => {
          const submitted = submittedValues(spec, values, types)
          return spec.sections.map((section) => {
            const columns = section.columns ?? 1
            const grid = (
              <div className={cn('grid gap-5', GRID[columns])}>
                {section.fields.map((field) => {
                  const visible = isFieldVisible(spec, field.name, submitted)
                  if (!visible && !showHidden) return null
                  const type = types[field.type] as FormFieldType | undefined
                  const label =
                    field.required || type?.inline ? (
                      field.label
                    ) : (
                      <>
                        {field.label}
                        <span className="font-normal text-muted-foreground"> ({t.optional})</span>
                      </>
                    )
                  const node = (
                    <div key={field.name} className={fieldSpanClass(field, columns)}>
                      {type ? (
                        <form.AppField
                          name={field.name}
                          validators={{
                            onChange: ({ fieldApi }) => {
                              const all = submittedValues(spec, fieldApi.form.state.values, types)
                              if (!isFieldVisible(spec, field.name, all)) return undefined
                              const error = checkFormField(field, all[field.name], types)
                              return error ? errorText(error) : undefined
                            },
                          }}
                        >
                          {() => type.render(field, label)}
                        </form.AppField>
                      ) : (
                        <p className="rounded-md border border-dashed border-border px-3 py-2 text-[13px] text-muted-foreground">
                          {t.unknownType(field.type)}
                        </p>
                      )}
                    </div>
                  )
                  return renderField ? (
                    <React.Fragment key={field.name}>
                      {renderField(field, node, visible)}
                    </React.Fragment>
                  ) : (
                    node
                  )
                })}
              </div>
            )
            const body = renderSection ? renderSection(section, grid) : grid
            return section.title || section.description ? (
              <FieldSet key={section.id}>
                {section.title && <FieldLegend>{section.title}</FieldLegend>}
                {section.description && <FieldDescription>{section.description}</FieldDescription>}
                {body}
              </FieldSet>
            ) : (
              <React.Fragment key={section.id}>{body}</React.Fragment>
            )
          })
        }}
      </form.Subscribe>
      {!hideSubmit && (
        <form.AppForm>
          <form.FormErrors />
          <div>
            <form.SubmitButton>{submitLabel ?? spec.submitLabel ?? t.submit}</form.SubmitButton>
          </div>
        </form.AppForm>
      )}
    </form>
  )
}

/** Calls `onChange` after a render where the values changed (not during it). */
function ValuesListener({
  values,
  onChange,
}: {
  values: FormValues
  onChange: (values: FormValues) => void
}) {
  // Compared as JSON so a re-render with equal values doesn't call back (File objects compare as {}).
  const json = JSON.stringify(values)
  const latest = React.useRef({ values, onChange })
  React.useEffect(() => {
    latest.current = { values, onChange }
  })
  React.useEffect(() => {
    latest.current.onChange(latest.current.values)
  }, [json])
  return null
}

export {
  checkFormField,
  evaluateCondition,
  fieldSpanClass,
  type FormCondition,
  type FormConditionOp,
  type FormFieldCheck,
  type FormFieldError,
  type FormFieldSetting,
  type FormFieldSpec,
  type FormFieldType,
  type FormFieldTypes,
  formFieldTypes,
  type FormOption,
  FormRenderer,
  type FormRendererProps,
  type FormSectionSpec,
  type FormSpec,
  type FormSpecIssue,
  formSpecValues,
  type FormValues,
  fromJSONSchema,
  initialFormValues,
  isFieldVisible,
  type JSONSchema,
  readFormSpec,
  toJSONSchema,
}
