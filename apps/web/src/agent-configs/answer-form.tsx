// One question of a questionnaire as a form: its answer (scale, single or multiple choice, text)
// and the "More details" field the engine adds to every question. The questionnaire's steps and
// the summary's in-place edits both use it.
import { ChevronDownIcon } from 'lucide-react'
import * as React from 'react'

import {
  type DraftAnswer,
  fromFields,
  toFields,
  useAnswerSchema,
  useLocalized,
} from '@/agent-configs/catalog'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useAppForm } from '@/components/ui/form'
import { Markdown } from '@/components/ui/markdown'
import {
  ANSWER_DETAILS_MAX_LENGTH,
  ANSWER_TEXT_MAX_LENGTH,
  type Question,
  type Questionnaire,
} from '@/lib/agent-configs'
import { useT } from '@/lib/locale'
import { cn } from '@/lib/utils'

/** Catalog labels mark code with backticks: rendered as inline Markdown, never as HTML. */
export function CatalogText({ text }: { text: string }) {
  return <Markdown inline>{text}</Markdown>
}

/**
 * The fields of one question. `onSubmit` gets the answer; with `required`, an empty answer is
 * refused. The parent gives the actions, rendered inside the form as `actions(form)`.
 */
export function AnswerForm({
  question,
  scaleLabels,
  initial,
  required,
  onChange,
  onSubmit,
  actions,
  className,
}: {
  question: Question
  scaleLabels: Questionnaire['scaleLabels']
  initial: DraftAnswer | undefined
  required: boolean
  /** Called on every change, with the answer as it stands (to keep a draft). */
  onChange?: (answer: DraftAnswer) => void
  onSubmit: (answer: DraftAnswer) => Promise<void> | void
  actions: React.ReactNode
  className?: string
}) {
  const t = useT()
  const localized = useLocalized()
  const options = question.options ?? []
  const freeText = options.find((option) => option.freeText)
  const schema = useAnswerSchema(question, required)
  const label = <CatalogText text={localized(question.label)} />
  const help = question.help ? localized(question.help) : undefined

  const form = useAppForm({
    defaultValues: toFields(question, initial),
    validators: { onSubmit: schema },
    listeners: {
      onChange: ({ formApi }) => onChange?.(fromFields(question, formApi.state.values)),
    },
    onSubmit: ({ value }) => onSubmit(fromFields(question, value)),
  })
  const [open, setOpen] = React.useState(!!initial?.details)

  return (
    <form
      noValidate
      className={cn('flex flex-col gap-5', className)}
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppForm>
        {question.type === 'scale' && (
          <form.AppField name="scale">
            {(field) => (
              <field.ScaleField
                label={label}
                description={help}
                minLabel={localized(scaleLabels.min)}
                maxLabel={localized(scaleLabels.max)}
              />
            )}
          </form.AppField>
        )}
        {question.type === 'single' && (
          <>
            <form.AppField name="choice">
              {(field) => (
                <field.RadioGroupField
                  label={label}
                  description={help}
                  options={options.map((o) => ({ value: o.value, label: localized(o.label) }))}
                />
              )}
            </form.AppField>
            {freeText && (
              <form.Subscribe selector={(state) => state.values.choice}>
                {(choice) =>
                  choice === freeText.value && (
                    <form.AppField name="other">
                      {(field) => (
                        <field.TextField label={t.agents.otherLabel} autoComplete="off" />
                      )}
                    </form.AppField>
                  )
                }
              </form.Subscribe>
            )}
          </>
        )}
        {question.type === 'multi' && (
          <form.AppField name="picks">
            {(field) => (
              <field.CheckboxGroupField
                label={label}
                description={help}
                options={options.map((o) => ({
                  value: o.value,
                  label: localized(o.label),
                  exclusive: o.exclusive,
                }))}
              />
            )}
          </form.AppField>
        )}
        {question.type === 'text' && (
          <form.AppField name="text">
            {(field) => (
              <field.TextareaField
                label={label}
                description={help}
                rows={3}
                maxCount={ANSWER_TEXT_MAX_LENGTH}
              />
            )}
          </form.AppField>
        )}
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit">
              <ChevronDownIcon
                className={cn('transition-transform duration-fast', open && 'rotate-180')}
              />
              {t.agents.moreDetails}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <form.AppField name="details">
              {(field) => (
                <field.TextareaField
                  label={t.agents.moreDetails}
                  hideLabel
                  description={t.agents.moreDetailsHint}
                  rows={3}
                  maxCount={ANSWER_DETAILS_MAX_LENGTH}
                />
              )}
            </form.AppField>
          </CollapsibleContent>
        </Collapsible>
        {actions}
      </form.AppForm>
    </form>
  )
}
