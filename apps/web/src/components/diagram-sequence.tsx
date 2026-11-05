'use client'

// Coreloom UI — Diagram sequence parts. For a sequence diagram, the diagram editor shows its
// participants and steps as a list to pick from (the keyboard's way to what a click on the
// drawing picks), and a form for the picked step: a message's ends, text and arrow, a note's
// place, an activation, a block's kind and conditions, and its order.
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { Choice, TextField, useDrafts } from '@/components/diagram-fields'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { type Messages, useCoreloomI18n } from '@/lib/i18n'
import type { SequenceArrow, SequenceBlockKind, SequenceDiagram, SequenceStep } from '@/lib/uml'
import {
  canAddSection,
  participantOptions,
  stepAt,
  stepId,
  stepPath,
} from '@/lib/uml-edit-sequence'
import { cn } from '@/lib/utils'

type ToolsText = Messages['diagramTools']
type SequenceText = Messages['diagram']['sequence']
/** The sequence strings, and how a label follows what it's about ("User to App, call: Sign in"). */
type SummaryText = SequenceText & { say: Messages['diagram']['labelled'] }
type Block = Extract<SequenceStep, { type: 'block' }>

const ARROWS: readonly SequenceArrow[] = [
  'sync',
  'reply',
  'async',
  'dottedAsync',
  'line',
  'dottedLine',
  'lost',
  'dottedLost',
]
const BLOCKS: readonly SequenceBlockKind[] = ['loop', 'alt', 'opt', 'par', 'critical', 'break']

/** One line saying what a step is: "User to App, call: Sign in", "Loop [every second]". */
function stepSummary(step: SequenceStep, name: (id: string) => string, t: SummaryText): string {
  const say = (what: string, text: string) => (text ? t.say(what, text.replace(/\n/g, ' ')) : what)
  switch (step.type) {
    case 'message': {
      const kind = t.arrows[step.arrow]
      const who =
        step.from === step.to
          ? t.self(name(step.from), kind)
          : t.message(name(step.from), name(step.to), kind)
      return say(who, step.text)
    }
    case 'note':
      return say(t.note(step.participants.map(name).join(` ${t.and} `)), step.text)
    case 'activation':
      return step.active ? t.activate(name(step.participant)) : t.deactivate(name(step.participant))
    case 'block': {
      const label = step.sections[0]?.label
      return label ? `${t.blocks[step.kind]} [${label}]` : t.blocks[step.kind]
    }
  }
}

interface OutlineProps {
  diagram: SequenceDiagram
  selected: readonly string[]
  /** A click picks one item; with Ctrl, ⌘ or Shift it's added to (or taken from) the selection. */
  onSelect: (ids: string[]) => void
  /** The buttons by id, so the editor can focus a step it just added. */
  buttons: React.RefObject<Map<string, HTMLButtonElement>>
  t: ToolsText
}

function pick(selected: readonly string[], id: string, additive: boolean): string[] {
  if (!additive) return [id]
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
}

function OutlineItem({
  id,
  label,
  props,
}: {
  id: string
  label: string
  props: Omit<OutlineProps, 't' | 'diagram'>
}) {
  const on = props.selected.includes(id)
  return (
    <button
      type="button"
      aria-pressed={on}
      ref={(el) => {
        if (el) props.buttons.current.set(id, el)
        else props.buttons.current.delete(id)
      }}
      className={cn(
        'line-clamp-2 w-full rounded-sm px-2 py-1 text-left text-[12.5px] wrap-anywhere text-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring',
        on && 'bg-primary-subtle font-medium hover:bg-primary-subtle',
      )}
      title={label}
      onClick={(e) => {
        props.onSelect(pick(props.selected, id, e.ctrlKey || e.metaKey || e.shiftKey))
      }}
    >
      {label}
    </button>
  )
}

function StepItems({
  steps,
  prefix,
  name,
  props,
  t,
}: {
  steps: readonly SequenceStep[]
  prefix: readonly number[]
  name: (id: string) => string
  props: Omit<OutlineProps, 't' | 'diagram'>
  t: SummaryText
}) {
  return (
    <ol className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
      {steps.map((step, i) => {
        const path = [...prefix, i]
        const id = stepId(path)
        return (
          <li key={id}>
            <OutlineItem id={id} label={stepSummary(step, name, t)} props={props} />
            {step.type === 'block' &&
              step.sections.map((s, n) => (
                // eslint-disable-next-line @eslint-react/no-array-index-key -- sections have no ids
                <div key={n} className="ml-2 border-l border-border pl-1.5">
                  {n > 0 && (
                    <p className="px-2 pt-1 text-[11.5px] text-muted-foreground">
                      [{[t.sections[step.kind], s.label].filter(Boolean).join(' ')}]
                    </p>
                  )}
                  <StepItems
                    steps={s.steps}
                    prefix={[...path, n]}
                    name={name}
                    props={props}
                    t={t}
                  />
                </div>
              ))}
          </li>
        )
      })}
    </ol>
  )
}

/** The participants and steps of a sequence diagram, each one a button that selects it. */
function SequenceOutline({ diagram, t, ...props }: OutlineProps) {
  const words = useCoreloomI18n().messages.diagram
  const seq: SummaryText = { ...words.sequence, say: words.labelled }
  const id = React.useId()
  const names = new Map(participantOptions(diagram).map((p) => [p.id, p.name]))
  const name = (x: string) => names.get(x) ?? x
  const heading =
    'font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase'
  return (
    <div className="grid gap-2">
      <div role="group" aria-labelledby={`${id}-people`}>
        <p id={`${id}-people`} className={heading}>
          {t.steps.participants}
        </p>
        <ul className="mt-1 grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {diagram.participants.map((p) => (
            <li key={p.id}>
              <OutlineItem id={p.id} label={name(p.id)} props={props} />
            </li>
          ))}
        </ul>
      </div>
      <div role="group" aria-labelledby={`${id}-steps`}>
        <p id={`${id}-steps`} className={heading}>
          {t.steps.label}
        </p>
        {diagram.steps.length ? (
          <div className="mt-1">
            <StepItems steps={diagram.steps} prefix={[]} name={name} props={props} t={seq} />
          </div>
        ) : (
          <p className="mt-1 text-[12.5px] text-muted-foreground">{t.steps.empty}</p>
        )}
      </div>
    </div>
  )
}

// ── The step form ───────────────────────────────────────────────────────────────────────────────

interface StepFormProps {
  diagram: SequenceDiagram
  id: string
  step: SequenceStep
  locked: boolean
  onChange: (id: string, step: SequenceStep) => void
  onMove: (id: string, delta: -1 | 1) => void
  onAddSection: (id: string) => void
  onRemoveSection: (id: string, index: number) => void
  t: ToolsText
}

function CheckField({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Label className="flex items-center gap-2 font-normal">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(c) => {
          onChange(c === true)
        }}
      />
      {label}
    </Label>
  )
}

function MessageFields({
  step,
  props,
}: {
  step: Extract<SequenceStep, { type: 'message' }>
  props: StepFormProps
}) {
  const seq = useCoreloomI18n().messages.diagram.sequence
  const { diagram, id, locked, onChange, t } = props
  const { drafts, set, take } = useDrafts<{ text: string }>(id)
  const people = participantOptions(diagram).map((p) => ({ value: p.id, label: p.name }))
  const change = (patch: Partial<typeof step>) => {
    onChange(id, { ...step, ...patch })
  }
  return (
    <>
      {(['from', 'to'] as const).map((side) => (
        <Choice
          key={side}
          label={t.form[side]}
          value={step[side]}
          options={people}
          disabled={locked}
          onChange={(v) => {
            change({ [side]: v })
          }}
        />
      ))}
      <TextField
        label={t.steps.text}
        value={drafts.text ?? step.text}
        disabled={locked}
        onChange={(v) => {
          set('text', v)
        }}
        onCommit={() => {
          const { text } = take()
          if (text !== undefined && text !== step.text) change({ text: text.trim() })
        }}
      />
      <Choice<SequenceArrow>
        label={t.steps.arrow}
        value={step.arrow}
        options={ARROWS.map((a) => ({ value: a, label: seq.arrows[a] }))}
        disabled={locked}
        onChange={(arrow) => {
          change({ arrow })
        }}
      />
      <CheckField
        label={t.steps.activateTarget}
        checked={Boolean(step.activate)}
        disabled={locked}
        onChange={(on) => {
          const { activate: _a, deactivate: _d, ...rest } = step
          onChange(id, on ? { ...rest, activate: true } : rest)
        }}
      />
      <CheckField
        label={t.steps.deactivateSender}
        checked={Boolean(step.deactivate)}
        disabled={locked}
        onChange={(on) => {
          const { activate: _a, deactivate: _d, ...rest } = step
          onChange(id, on ? { ...rest, deactivate: true } : rest)
        }}
      />
    </>
  )
}

function NoteFields({
  step,
  props,
}: {
  step: Extract<SequenceStep, { type: 'note' }>
  props: StepFormProps
}) {
  const { diagram, id, locked, onChange, t } = props
  const { drafts, set, take } = useDrafts<{ text: string }>(id)
  const people = participantOptions(diagram).map((p) => ({ value: p.id, label: p.name }))
  const first = step.participants.at(0) ?? ''
  const second = step.participants.at(1)
  const change = (patch: Partial<typeof step>) => {
    onChange(id, { ...step, ...patch })
  }
  return (
    <>
      <Choice<'left' | 'right' | 'over'>
        label={t.steps.position}
        value={step.position}
        options={(['left', 'right', 'over'] as const).map((v) => ({
          value: v,
          label: t.steps.positions[v],
        }))}
        disabled={locked}
        onChange={(position) => {
          // Only a note over the lifelines spans two participants.
          change({ position, participants: position === 'over' ? step.participants : [first] })
        }}
      />
      <Choice
        label={t.steps.participant}
        value={first}
        options={people}
        disabled={locked}
        onChange={(v) => {
          change({ participants: second && second !== v ? [v, second] : [v] })
        }}
      />
      {step.position === 'over' && (
        <Choice
          label={t.steps.second}
          value={second ?? ''}
          options={[{ value: '', label: t.steps.none }, ...people.filter((p) => p.value !== first)]}
          disabled={locked}
          onChange={(v) => {
            change({ participants: v ? [first, v] : [first] })
          }}
        />
      )}
      <TextField
        label={t.steps.text}
        value={drafts.text ?? step.text}
        multiline
        disabled={locked}
        onChange={(v) => {
          set('text', v)
        }}
        onCommit={() => {
          const { text } = take()
          if (text !== undefined && text !== step.text) change({ text: text.trim() })
        }}
      />
    </>
  )
}

function ActivationFields({
  step,
  props,
}: {
  step: Extract<SequenceStep, { type: 'activation' }>
  props: StepFormProps
}) {
  const { diagram, id, locked, onChange, t } = props
  const people = participantOptions(diagram).map((p) => ({ value: p.id, label: p.name }))
  return (
    <>
      <Choice
        label={t.steps.participant}
        value={step.participant}
        options={people}
        disabled={locked}
        onChange={(participant) => {
          onChange(id, { ...step, participant })
        }}
      />
      <Choice<'on' | 'off'>
        label={t.steps.change}
        value={step.active ? 'on' : 'off'}
        options={[
          { value: 'on', label: t.steps.activates },
          { value: 'off', label: t.steps.deactivates },
        ]}
        disabled={locked}
        onChange={(v) => {
          onChange(id, { ...step, active: v === 'on' })
        }}
      />
    </>
  )
}

/** A block of another kind; one that can't have several sections keeps all steps in its first. */
function withKind(block: Block, kind: SequenceBlockKind): Block {
  if (canAddSection(kind) || block.sections.length < 2) return { ...block, kind }
  const [first = { label: '', steps: [] }] = block.sections
  const steps = block.sections.flatMap((s) => s.steps)
  return { ...block, kind, sections: [{ ...first, steps }] }
}

function BlockFields({ step, props }: { step: Block; props: StepFormProps }) {
  const seq = useCoreloomI18n().messages.diagram.sequence
  const { id, locked, onChange, onAddSection, onRemoveSection, t } = props
  const { drafts, set, take } = useDrafts<Record<string, string>>(id)
  const word = seq.sections[step.kind]
  const commit = () => {
    const changed = take()
    if (!Object.keys(changed).length) return
    const sections = step.sections.map((s, n) => ({ ...s, label: (changed[n] ?? s.label).trim() }))
    onChange(id, { ...step, sections })
  }
  return (
    <>
      <Choice<SequenceBlockKind>
        label={t.steps.kind}
        value={step.kind}
        options={BLOCKS.map((k) => ({ value: k, label: seq.blocks[k] }))}
        disabled={locked}
        onChange={(kind) => {
          onChange(id, withKind(step, kind))
        }}
      />
      {step.sections.map((s, n) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- sections have no ids
        <div key={n} className="flex items-end gap-1">
          <div className="min-w-0 flex-1">
            <TextField
              label={n === 0 ? t.steps.condition : t.steps.sectionLabel(word, n)}
              value={drafts[n] ?? s.label}
              disabled={locked}
              onChange={(v) => {
                set(String(n), v)
              }}
              onCommit={commit}
            />
          </div>
          {n > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={locked}
              aria-label={t.steps.removeSection(word, n)}
              title={t.steps.removeSection(word, n)}
              onClick={() => {
                onRemoveSection(id, n)
              }}
            >
              <XIcon aria-hidden />
            </Button>
          )}
        </div>
      ))}
      {canAddSection(step.kind) && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locked}
          onClick={() => {
            onAddSection(id)
          }}
        >
          <PlusIcon aria-hidden />
          {t.steps.addSection(word)}
        </Button>
      )}
    </>
  )
}

function Fields({ props }: { props: StepFormProps }) {
  const { step } = props
  switch (step.type) {
    case 'message':
      return <MessageFields step={step} props={props} />
    case 'note':
      return <NoteFields step={step} props={props} />
    case 'activation':
      return <ActivationFields step={step} props={props} />
    case 'block':
      return <BlockFields step={step} props={props} />
  }
}

/** The form for one step, with buttons to move it up or down in its list. */
function StepForm(props: StepFormProps) {
  const { diagram, id, locked, onMove, t } = props
  const path = stepPath(id) ?? []
  const index = path.at(-1) ?? 0
  const siblings = path.length > 1 ? stepAt(diagram.steps, path.slice(0, -2)) : undefined
  const section = path.at(-2)
  const count =
    siblings?.type === 'block' && section !== undefined
      ? (siblings.sections[section]?.steps.length ?? 0)
      : diagram.steps.length
  const up = React.useRef<HTMLButtonElement>(null)
  const down = React.useRef<HTMLButtonElement>(null)
  const move = (delta: -1 | 1) => {
    onMove(id, delta)
    // At the end of the list the button is about to be disabled: focus goes to the other one.
    const end = delta < 0 ? index - 1 === 0 : index + 1 === count - 1
    if (end) requestAnimationFrame(() => (delta < 0 ? down : up).current?.focus())
  }
  return (
    <>
      <Fields props={props} />
      <div className="flex flex-wrap gap-1.5">
        <Button
          ref={up}
          type="button"
          variant="outline"
          size="sm"
          disabled={locked || index === 0}
          onClick={() => {
            move(-1)
          }}
        >
          <ArrowUpIcon aria-hidden />
          {t.steps.moveUp}
        </Button>
        <Button
          ref={down}
          type="button"
          variant="outline"
          size="sm"
          disabled={locked || index >= count - 1}
          onClick={() => {
            move(1)
          }}
        >
          <ArrowDownIcon aria-hidden />
          {t.steps.moveDown}
        </Button>
      </div>
    </>
  )
}

export { SequenceOutline, StepForm, type StepFormProps, stepSummary }
