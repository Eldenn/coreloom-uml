// The forms of a project's Design tab: one requirement, one decision with the options weighed.
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { useAppForm } from '@/components/ui/form'
import { toast } from '@/components/ui/sonner'
import { getErrorMessage } from '@/lib/client'
import { parsePartKey, partKey, partMissing, viewParts } from '@/lib/decision-parts'
import {
  type Decision,
  DECISION_STATUSES,
  DESIGN_LIMITS,
  type Requirement,
  REQUIREMENT_CATEGORIES,
  REQUIREMENT_PRIORITIES,
  useSaveDecision,
  useSaveRequirement,
} from '@/lib/design-records'
import { useT } from '@/lib/locale'
import type { ProjectDiagram } from '@/lib/project-diagrams'

/** A select option can't have an empty value. */
const NONE = 'none'

export function RequirementForm({
  projectId,
  requirement,
  onDone,
}: {
  projectId: number
  /** The requirement to change; a new one when absent. */
  requirement?: Requirement
  onDone: () => void
}) {
  const t = useT()
  const save = useSaveRequirement(projectId)
  const form = useAppForm({
    defaultValues: {
      category: requirement?.category ?? REQUIREMENT_CATEGORIES[0],
      priority: requirement?.priority ?? REQUIREMENT_PRIORITIES[0],
      statement: requirement?.statement ?? '',
      measure: requirement?.measure ?? '',
    },
    validators: {
      onSubmit: z.object({
        category: z.enum(REQUIREMENT_CATEGORIES),
        priority: z.enum(REQUIREMENT_PRIORITIES),
        statement: z
          .string()
          .trim()
          .min(1, t.design.statementRequired)
          .max(DESIGN_LIMITS.statement),
        measure: z.string().max(DESIGN_LIMITS.measure),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({
          id: requirement?.id,
          body: {
            category: value.category,
            priority: value.priority,
            statement: value.statement.trim(),
            measure: value.measure.trim() || null,
          },
        })
        toast.success(t.design.requirementSaved)
        onDone()
      } catch (error) {
        toast.error(getErrorMessage(error, t.design.failed))
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
        <form.AppField name="statement">
          {(field) => (
            <field.TextareaField
              label={t.design.statement}
              description={t.design.statementHint}
              maxCount={DESIGN_LIMITS.statement}
            />
          )}
        </form.AppField>
        <div className="grid gap-4 sm:grid-cols-2">
          <form.AppField name="category">
            {(field) => (
              <field.SelectField
                label={t.design.category}
                options={REQUIREMENT_CATEGORIES.map((value) => ({
                  value,
                  label: t.design.categories[value],
                }))}
              />
            )}
          </form.AppField>
          <form.AppField name="priority">
            {(field) => (
              <field.SelectField
                label={t.design.priority}
                options={REQUIREMENT_PRIORITIES.map((value) => ({
                  value,
                  label: t.design.priorities[value],
                }))}
              />
            )}
          </form.AppField>
        </div>
        <form.AppField name="measure">
          {(field) => (
            <field.TextField
              label={t.design.measure}
              description={t.design.measureHint}
              autoComplete="off"
            />
          )}
        </form.AppField>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {t.design.cancel}
          </Button>
          <form.SubmitButton>{t.design.save}</form.SubmitButton>
        </DialogFooter>
      </form.AppForm>
    </form>
  )
}

const emptyOption = { name: '', pros: '', cons: '' }

function useDecisionSchema() {
  const t = useT()
  return z
    .object({
      title: z.string().trim().min(1, t.design.titleRequired).max(DESIGN_LIMITS.title),
      context: z.string().max(DESIGN_LIMITS.text),
      options: z
        .array(
          z.object({
            name: z.string().trim().min(1, t.design.optionsRequired).max(DESIGN_LIMITS.optionName),
            pros: z.string().max(DESIGN_LIMITS.optionText),
            cons: z.string().max(DESIGN_LIMITS.optionText),
          }),
        )
        .min(1, t.design.optionsRequired)
        .max(DESIGN_LIMITS.options),
      chosen: z.string(),
      consequences: z.string().max(DESIGN_LIMITS.text),
      status: z.enum(DECISION_STATUSES),
      supersededBy: z.string(),
      requirementIds: z.array(z.string()),
      diagramIds: z.array(z.string()),
      parts: z.array(z.string()).max(DESIGN_LIMITS.parts),
    })
    .superRefine((value, context) => {
      const names = value.options.map((option) => option.name.trim())
      if (new Set(names).size !== names.length)
        context.addIssue({ code: 'custom', path: ['options'], message: t.design.optionsRequired })
      if (value.status === 'accepted' && !names.includes(value.chosen))
        context.addIssue({ code: 'custom', path: ['chosen'], message: t.design.chosenRequired })
    })
}

type DecisionValues = z.infer<ReturnType<typeof useDecisionSchema>>

const EMPTY_DECISION: DecisionValues = {
  title: '',
  context: '',
  options: [emptyOption, emptyOption],
  chosen: NONE,
  consequences: '',
  status: 'proposed',
  supersededBy: NONE,
  requirementIds: [],
  diagramIds: [],
  parts: [],
}

function toValues(decision: Decision | undefined): DecisionValues {
  if (!decision) return EMPTY_DECISION
  return {
    title: decision.title,
    context: decision.context ?? '',
    options: decision.options.map((option) => ({
      name: option.name,
      pros: option.pros ?? '',
      cons: option.cons ?? '',
    })),
    chosen: decision.chosen ?? NONE,
    consequences: decision.consequences ?? '',
    status: decision.status,
    supersededBy: decision.supersededById === null ? NONE : String(decision.supersededById),
    requirementIds: decision.requirementIds.map(String),
    diagramIds: decision.diagramIds.map(String),
    parts: decision.parts.map(partKey),
  }
}

function toBody(value: DecisionValues) {
  const options = value.options.map((option) => ({
    name: option.name.trim(),
    pros: option.pros.trim() || null,
    cons: option.cons.trim() || null,
  }))
  const superseded = value.status === 'superseded' && value.supersededBy !== NONE
  return {
    title: value.title.trim(),
    context: value.context.trim() || null,
    options,
    // An option renamed or removed since it was chosen is no longer chosen.
    chosen: options.some((option) => option.name === value.chosen) ? value.chosen : null,
    consequences: value.consequences.trim() || null,
    status: value.status,
    supersededById: superseded ? Number(value.supersededBy) : null,
    requirementIds: value.requirementIds.map(Number),
    diagramIds: value.diagramIds.map(Number),
    // A part of a diagram the decision no longer names goes with it.
    parts: value.parts
      .map(parsePartKey)
      .filter((part) => value.diagramIds.includes(String(part.diagramId))),
  }
}

interface DecisionFormProps {
  projectId: number
  /** The decision to change; a new one when absent. */
  decision?: Decision
  onDone: () => void
}

function useDecisionForm({ projectId, decision, onDone }: DecisionFormProps) {
  const t = useT()
  const save = useSaveDecision(projectId)
  return useAppForm({
    defaultValues: toValues(decision),
    validators: { onSubmit: useDecisionSchema() },
    onSubmit: async ({ value }) => {
      try {
        await save.mutateAsync({ id: decision?.id, body: toBody(value) })
        toast.success(t.design.decisionSaved)
        onDone()
      } catch (error) {
        toast.error(getErrorMessage(error, t.design.failed))
      }
    },
  })
}

type DecisionFormApi = ReturnType<typeof useDecisionForm>

/** The options weighed: one to five, each with what speaks for and against it. */
function OptionsFields({ form }: { form: DecisionFormApi }) {
  const t = useT()
  return (
    <form.Field name="options" mode="array">
      {(list) => (
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-medium">{t.design.options}</legend>
          {list.state.value.map((_, index) => (
            <div
              // eslint-disable-next-line @eslint-react/no-array-index-key -- an option has no id of its own: its position is its identity
              key={index}
              role="group"
              aria-label={t.design.option(index + 1)}
              className="flex flex-col gap-3 rounded-md border border-border p-3"
            >
              <div className="flex items-end gap-2">
                <form.AppField name={`options[${index}].name`}>
                  {(field) => (
                    <field.TextField
                      className="flex-1"
                      label={`${t.design.option(index + 1)}: ${t.design.optionName}`}
                      autoComplete="off"
                    />
                  )}
                </form.AppField>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t.design.removeOption(index + 1)}
                  disabled={list.state.value.length === 1}
                  onClick={() => {
                    list.removeValue(index)
                  }}
                >
                  <Trash2Icon />
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <form.AppField name={`options[${index}].pros`}>
                  {(field) => <field.TextareaField label={t.design.pros} rows={2} />}
                </form.AppField>
                <form.AppField name={`options[${index}].cons`}>
                  {(field) => <field.TextareaField label={t.design.cons} rows={2} />}
                </form.AppField>
              </div>
            </div>
          ))}
          {list.state.meta.errors.length > 0 && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {t.design.optionsRequired}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            disabled={list.state.value.length >= DESIGN_LIMITS.options}
            onClick={() => {
              list.pushValue(emptyOption)
            }}
          >
            <PlusIcon /> {t.design.addOption}
          </Button>
        </fieldset>
      )}
    </form.Field>
  )
}

/** Where the decision stands: its status, the option chosen and the decision that replaced it. */
function OutcomeFields({ form, others }: { form: DecisionFormApi; others: readonly Decision[] }) {
  const t = useT()
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <form.AppField name="status">
          {(field) => (
            <field.SelectField
              label={t.design.status}
              options={DECISION_STATUSES.map((value) => ({
                value,
                label: t.design.statuses[value],
              }))}
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.options}>
          {(options) => (
            <form.AppField name="chosen">
              {(field) => (
                <field.SelectField
                  label={t.design.chosen}
                  options={[
                    { value: NONE, label: t.design.notChosen },
                    ...[...new Set(options.map((option) => option.name.trim()))]
                      .filter((name) => name !== '' && name !== NONE)
                      .map((name) => ({ value: name, label: name })),
                  ]}
                />
              )}
            </form.AppField>
          )}
        </form.Subscribe>
      </div>
      <form.Subscribe selector={(state) => state.values.status}>
        {(status) =>
          status === 'superseded' &&
          others.length > 0 && (
            <form.AppField name="supersededBy">
              {(field) => (
                <field.SelectField
                  label={t.design.supersededBy}
                  options={[
                    { value: NONE, label: t.design.none },
                    ...others.map((other) => ({ value: String(other.id), label: other.title })),
                  ]}
                />
              )}
            </form.AppField>
          )
        }
      </form.Subscribe>
    </>
  )
}

/**
 * The parts of the diagrams the decision names that it is about: every part of those views, and
 * the ones it already names that a view no longer has, marked as such.
 */
function PartsField({
  form,
  diagrams,
}: {
  form: DecisionFormApi
  diagrams: readonly ProjectDiagram[]
}) {
  const t = useT()
  return (
    <form.Subscribe selector={(state) => [state.values.diagramIds, state.values.parts] as const}>
      {([diagramIds, held]) => {
        const named = diagrams.filter((diagram) => diagramIds.includes(String(diagram.id)))
        if (named.length === 0) return null
        const options = named.flatMap((diagram) =>
          viewParts(diagram.content).map((part) => ({
            value: partKey({ diagramId: diagram.id, ...part }),
            label: t.design.partOption(diagram.title, part.label),
          })),
        )
        const known = new Set(options.map((option) => option.value))
        for (const key of held) {
          const part = parsePartKey(key)
          const diagram = named.find((item) => item.id === part.diagramId)
          if (known.has(key) || !diagram || !partMissing(diagram.content, part)) continue
          options.push({
            value: key,
            label: t.design.partGone(t.design.partOption(diagram.title, part.label)),
          })
        }
        return (
          <form.AppField name="parts">
            {(field) => (
              <field.MultiSelectField
                label={t.design.linkedParts}
                description={t.design.linkedPartsHint}
                options={options}
                maxSelected={DESIGN_LIMITS.parts}
              />
            )}
          </form.AppField>
        )
      }}
    </form.Subscribe>
  )
}

export function DecisionForm({
  decisions,
  requirements,
  diagrams,
  ...props
}: DecisionFormProps & {
  /** The project's decisions, one of which may have replaced this one. */
  decisions: readonly Decision[]
  requirements: readonly Requirement[]
  diagrams: readonly ProjectDiagram[]
}) {
  const t = useT()
  const form = useDecisionForm(props)
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
        <form.AppField name="title">
          {(field) => (
            <field.TextField
              label={t.design.title}
              description={t.design.titleHint}
              autoComplete="off"
            />
          )}
        </form.AppField>
        <form.AppField name="context">
          {(field) => (
            <field.TextareaField label={t.design.context} description={t.design.contextHint} />
          )}
        </form.AppField>
        <OptionsFields form={form} />
        <OutcomeFields
          form={form}
          others={decisions.filter((other) => other.id !== props.decision?.id)}
        />
        <form.AppField name="consequences">
          {(field) => (
            <field.TextareaField
              label={t.design.consequences}
              description={t.design.consequencesHint}
            />
          )}
        </form.AppField>
        {requirements.length > 0 && (
          <form.AppField name="requirementIds">
            {(field) => (
              <field.MultiSelectField
                label={t.design.linkedRequirements}
                options={requirements.map((requirement) => ({
                  value: String(requirement.id),
                  label: requirement.statement,
                }))}
              />
            )}
          </form.AppField>
        )}
        {diagrams.length > 0 && (
          <form.AppField name="diagramIds">
            {(field) => (
              <field.MultiSelectField
                label={t.design.linkedDiagrams}
                options={diagrams.map((diagram) => ({
                  value: String(diagram.id),
                  label: `${diagram.architecture} / ${diagram.title}`,
                }))}
              />
            )}
          </form.AppField>
        )}
        <PartsField form={form} diagrams={diagrams} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={props.onDone}>
            {t.design.cancel}
          </Button>
          <form.SubmitButton>{t.design.save}</form.SubmitButton>
        </DialogFooter>
      </form.AppForm>
    </form>
  )
}
