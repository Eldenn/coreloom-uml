'use client'

// Coreloom UI — Diagram properties. The diagram editor's panel for what's selected: an element's
// name, stereotype, members, attributes, description or technology; a relation's kind, label and
// ends; a sequence step's fields. A text field applies when it loses focus (or on Enter); a
// choice applies at once.
import { ArrowLeftRightIcon } from 'lucide-react'
import * as React from 'react'

import { Choice, type NameField, TextField, useDrafts } from '@/components/diagram-fields'
import { MemberList } from '@/components/diagram-members'
import { StepForm, type StepFormProps } from '@/components/diagram-sequence'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { type Messages, useCoreloomI18n } from '@/lib/i18n'
import type { ErCardinality, SequenceStep, UmlSpec } from '@/lib/uml'
import { relationEnds, relationTypes, START_END, type UmlRelationType } from '@/lib/uml-edit'
import {
  elementFields,
  relationFields,
  stateRegionChoices,
  type UmlElementFields,
  type UmlRelationFields,
} from '@/lib/uml-edit-fields'
import { stepOf } from '@/lib/uml-edit-sequence'
import { cn } from '@/lib/utils'

type PropertiesText = Messages['diagramTools']

/** What the panel edits: one element, one relation, nothing, or several things. */
type Target =
  | { kind: 'element'; id: string; fields: UmlElementFields }
  | { kind: 'relation'; index: number; fields: UmlRelationFields; from: string; to: string }
  | { kind: 'step'; id: string; step: SequenceStep }
  | { kind: 'none' }
  | { kind: 'several'; count: number }

interface DiagramPropertiesProps {
  diagram: UmlSpec
  selection: { elements: readonly string[]; relations: readonly number[] }
  /** The tools can't edit (the text has problems): the fields are read-only. */
  locked: boolean
  onElementChange: (id: string, fields: UmlElementFields) => void
  onRelationChange: (index: number, fields: UmlRelationFields) => void
  onReverse: (index: number) => void
  /** What a sequence step's form does: change it, move it, add or remove a block's section. */
  steps?: Pick<StepFormProps, 'onChange' | 'onMove' | 'onAddSection' | 'onRemoveSection'>
  /** The name field, so the editor can focus it after adding an element. */
  nameRef?: React.Ref<NameField>
  className?: string
}

function relationEndsOf(diagram: UmlSpec, index: number): [string, string] {
  if (diagram.kind === 'sequence') return ['', '']
  const list: readonly { from: string; to: string }[] =
    diagram.kind === 'state' ? diagram.transitions : diagram.relations
  const r = index >= 0 && index < list.length ? list[index] : undefined
  return r ? [r.from, r.to] : ['', '']
}

function targetOf(diagram: UmlSpec, selection: DiagramPropertiesProps['selection']): Target {
  const count = selection.elements.length + selection.relations.length
  if (count > 1) return { kind: 'several', count }
  const id = selection.elements.at(0)
  if (id !== undefined) {
    const step = diagram.kind === 'sequence' ? stepOf(diagram, id) : undefined
    if (step) return { kind: 'step', id, step }
    const fields = elementFields(diagram, id)
    return fields ? { kind: 'element', id, fields } : { kind: 'none' }
  }
  const index = selection.relations.at(0)
  if (index === undefined) return { kind: 'none' }
  const fields = relationFields(diagram, index)
  if (!fields) return { kind: 'none' }
  const [from, to] = relationEndsOf(diagram, index)
  return { kind: 'relation', index, fields, from, to }
}

/** What a stereotype says in each kind: a deployment node's platform, a component's role. */
function stereotypeHint(kind: UmlSpec['kind'], p: PropertiesText['properties']): string {
  switch (kind) {
    case 'deployment':
      return p.deploymentStereotypeHint
    case 'component':
      return p.componentStereotypeHint
    case 'package':
      return p.packageStereotypeHint
    default:
      return p.stereotypeHint
  }
}

function ElementForm({
  target,
  kind,
  regions,
  locked,
  onChange,
  nameRef,
  t,
}: {
  target: Extract<Target, { kind: 'element' }>
  /** The diagram's kind: a deployment node's stereotype is a platform, a class's a role. */
  kind: UmlSpec['kind']
  /** A state inside a composite one: the regions it can sit in. */
  regions: ReturnType<typeof stateRegionChoices>
  locked: boolean
  onChange: (id: string, fields: UmlElementFields) => void
  nameRef?: React.Ref<NameField> | undefined
  t: PropertiesText
}) {
  const { fields, id } = target
  const { drafts, set, take } = useDrafts<UmlElementFields>(id)
  const value = <K extends keyof UmlElementFields>(k: K) => drafts[k] ?? fields[k]
  const commit = () => {
    const changed = take()
    if (Object.keys(changed).length) onChange(id, { ...fields, ...changed })
  }
  const note = /^note:\d+$/.test(id)
  const p = t.properties
  const text = (k: 'name' | 'stereotype' | 'attributes' | 'description' | 'technology') =>
    value(k) ?? ''
  const check = (k: 'external' | 'actor', label: string) =>
    fields[k] !== undefined && (
      <Label className="flex items-center gap-2 font-normal">
        <Checkbox
          checked={fields[k]}
          disabled={locked}
          onCheckedChange={(checked) => {
            onChange(id, { ...fields, ...drafts, [k]: checked === true })
          }}
        />
        {label}
      </Label>
    )
  return (
    <>
      <TextField
        label={note ? p.text : p.name}
        value={text('name')}
        multiline={note}
        disabled={locked}
        inputRef={nameRef}
        onChange={(v) => {
          set('name', v)
        }}
        onCommit={commit}
      />
      {fields.stereotype !== undefined && (
        <TextField
          label={p.stereotype}
          value={text('stereotype')}
          hint={stereotypeHint(kind, p)}
          disabled={locked}
          onChange={(v) => {
            set('stereotype', v)
          }}
          onCommit={commit}
        />
      )}
      {fields.members && (
        <MemberList
          members={fields.members}
          disabled={locked}
          p={{ ...p, moveUp: t.steps.moveUp, moveDown: t.steps.moveDown }}
          onChange={(members) => {
            onChange(id, { ...fields, ...drafts, members })
          }}
        />
      )}
      {(['attributes', 'description'] as const).map(
        (k) =>
          fields[k] !== undefined && (
            <TextField
              key={k}
              label={p[k]}
              value={text(k)}
              multiline
              mono={k === 'attributes'}
              {...(k === 'attributes' ? { hint: p.attributesHint } : {})}
              disabled={locked}
              onChange={(v) => {
                set(k, v)
              }}
              onCommit={commit}
            />
          ),
      )}
      {fields.region !== undefined && regions && (
        <Choice
          label={p.region}
          value={String(fields.region)}
          options={[
            ...regions.regions.map((n, i) => ({ value: String(n), label: p.regionNumber(i + 1) })),
            ...(regions.next === null ? [] : [{ value: String(regions.next), label: p.newRegion }]),
          ]}
          disabled={locked}
          onChange={(region) => {
            onChange(id, { ...fields, ...drafts, region: Number(region) })
          }}
        />
      )}
      {fields.technology !== undefined && (
        <TextField
          label={p.technology}
          value={text('technology')}
          disabled={locked}
          onChange={(v) => {
            set('technology', v)
          }}
          onCommit={commit}
        />
      )}
      {check('external', p.external)}
      {check('actor', p.actor)}
    </>
  )
}

const ER_ENDS: readonly ErCardinality[] = ['zeroOrOne', 'exactlyOne', 'zeroOrMore', 'oneOrMore']

function RelationForm({
  target,
  diagram,
  locked,
  onChange,
  onReverse,
  t,
}: {
  target: Extract<Target, { kind: 'relation' }>
  diagram: UmlSpec
  locked: boolean
  onChange: (index: number, fields: UmlRelationFields) => void
  onReverse: (index: number) => void
  t: PropertiesText
}) {
  const cardinality = useCoreloomI18n().messages.diagram.cardinality
  const { fields, index } = target
  const { drafts, set, take } = useDrafts<UmlRelationFields>(String(index))
  const commit = () => {
    const changed = take()
    if (Object.keys(changed).length) onChange(index, { ...fields, ...changed })
  }
  const names = new Map(relationEnds(diagram).map((e) => [e.id, e.name]))
  const name = (id: string, side: 'from' | 'to') => {
    if (id === START_END) return side === 'from' ? t.form.start : t.form.end
    return names.get(id) ?? id
  }
  const p = t.properties
  const types = relationTypes(diagram)
  const text = (k: 'label' | 'fromCardinality' | 'toCardinality' | 'technology') =>
    drafts[k] ?? fields[k] ?? ''
  const textField = (
    k: 'label' | 'fromCardinality' | 'toCardinality' | 'technology',
    label: string,
  ) => (
    <TextField
      label={label}
      value={text(k)}
      disabled={locked}
      onChange={(v) => {
        set(k, v)
      }}
      onCommit={commit}
    />
  )
  return (
    <>
      <p className="text-[12.5px] text-fg-secondary">
        {p.relation(name(target.from, 'from'), name(target.to, 'to'))}
      </p>
      {fields.type !== undefined && types.length > 1 && (
        <Choice<UmlRelationType>
          label={p.kind}
          value={fields.type}
          options={types.map((x) => ({ value: x, label: t.relations[x] }))}
          disabled={locked}
          onChange={(type) => {
            onChange(index, { ...fields, ...drafts, type })
          }}
        />
      )}
      {textField('label', p.lineLabel)}
      {fields.fromCardinality !== undefined &&
        textField('fromCardinality', p.endAt(name(target.from, 'from')))}
      {fields.toCardinality !== undefined &&
        textField('toCardinality', p.endAt(name(target.to, 'to')))}
      {(['fromEnd', 'toEnd'] as const).map((k) => {
        const current = fields[k]
        if (current === undefined) return null
        return (
          <Choice<ErCardinality>
            key={k}
            label={p.endAt(k === 'fromEnd' ? name(target.from, 'from') : name(target.to, 'to'))}
            value={current}
            options={ER_ENDS.map((x) => ({ value: x, label: cardinality[x] }))}
            disabled={locked}
            onChange={(v) => {
              onChange(index, { ...fields, ...drafts, [k]: v })
            }}
          />
        )
      })}
      {fields.technology !== undefined && textField('technology', p.technology)}
      {diagram.kind !== 'state' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locked}
          onClick={() => {
            onReverse(index)
          }}
        >
          <ArrowLeftRightIcon aria-hidden />
          {p.reverse}
        </Button>
      )}
    </>
  )
}

function DiagramProperties({
  diagram,
  selection,
  locked,
  onElementChange,
  onRelationChange,
  onReverse,
  steps,
  nameRef,
  className,
}: DiagramPropertiesProps) {
  const t = useCoreloomI18n().messages.diagramTools
  const id = React.useId()
  const target = targetOf(diagram, selection)
  return (
    <div
      role="group"
      aria-labelledby={`${id}-title`}
      data-slot="diagram-properties"
      className={cn('flex min-h-0 flex-col gap-3 overflow-auto p-3', className)}
    >
      <p
        id={`${id}-title`}
        className="font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
      >
        {t.properties.label}
      </p>
      {target.kind === 'none' && (
        <p className="text-[12.5px] text-muted-foreground">{t.properties.empty}</p>
      )}
      {target.kind === 'several' && (
        <p className="text-[12.5px] text-muted-foreground">{t.properties.several(target.count)}</p>
      )}
      {target.kind === 'element' && (
        <ElementForm
          target={target}
          kind={diagram.kind}
          regions={stateRegionChoices(diagram, target.id)}
          locked={locked}
          onChange={onElementChange}
          nameRef={nameRef}
          t={t}
        />
      )}
      {target.kind === 'step' && diagram.kind === 'sequence' && steps && (
        <StepForm
          diagram={diagram}
          id={target.id}
          step={target.step}
          locked={locked}
          t={t}
          {...steps}
        />
      )}
      {target.kind === 'relation' && (
        <RelationForm
          target={target}
          diagram={diagram}
          locked={locked}
          onChange={onRelationChange}
          onReverse={onReverse}
          t={t}
        />
      )}
    </div>
  )
}

export { DiagramProperties, type DiagramPropertiesProps }
