import type {
  SequenceArrow,
  SequenceBlockKind,
  SequenceDiagram,
  SequenceParticipant,
  SequenceStep,
} from '@/lib/uml'

type Block = Extract<SequenceStep, { type: 'block' }>

const STEP = /^step:(\d+(?:\.\d+\.\d+)*)$/

/** The id of the step at `path`: `[2]` is `step:2`, `[2, 1, 0]` is `step:2.1.0`. */
function stepId(path: readonly number[]): string {
  return `step:${path.join('.')}`
}

/** The path in a step id, or null when it isn't one. */
function stepPath(id: string): number[] | null {
  const m = STEP.exec(id)
  return m?.[1] === undefined ? null : m[1].split('.').map(Number)
}

/** The item at `index`, or undefined past either end. */
function itemAt<T>(list: readonly T[], index: number | undefined): T | undefined {
  return index !== undefined && index >= 0 && index < list.length ? list[index] : undefined
}

/** The step at `path`, or undefined. */
function stepAt(steps: readonly SequenceStep[], path: readonly number[]): SequenceStep | undefined {
  const step = itemAt(steps, path.at(0))
  if (path.length < 2) return step
  if (step?.type !== 'block') return undefined
  const section = itemAt(step.sections, path.at(1))
  return section ? stepAt(section.steps, path.slice(2)) : undefined
}

/** The list the step at `path` sits in (the diagram's, or a block section's). */
function listOf(steps: readonly SequenceStep[], path: readonly number[]): readonly SequenceStep[] {
  if (path.length < 3) return steps
  const block = stepAt(steps, path.slice(0, -2))
  const section = block?.type === 'block' ? itemAt(block.sections, path.at(-2)) : undefined
  return section?.steps ?? []
}

/** The step a selected id names in this diagram, or undefined. */
function stepOf(diagram: SequenceDiagram, id: string): SequenceStep | undefined {
  const path = stepPath(id)
  return path ? stepAt(diagram.steps, path) : undefined
}

/** Every step's id, blocks' inner steps included. */
function stepIds(steps: readonly SequenceStep[], prefix: readonly number[] = []): string[] {
  return steps.flatMap((step, i) => {
    const path = [...prefix, i]
    if (step.type !== 'block') return [stepId(path)]
    return [stepId(path), ...step.sections.flatMap((s, n) => stepIds(s.steps, [...path, n]))]
  })
}

/** Changes the list a path ends in: `edit` gets that list and the path's last index. */
function editList(
  steps: readonly SequenceStep[],
  path: readonly number[],
  edit: (list: SequenceStep[], index: number) => SequenceStep[],
): SequenceStep[] {
  const [i = -1, section = -1] = path
  if (path.length < 2) return path.length ? edit([...steps], i) : [...steps]
  return steps.map((step, k) => {
    if (k !== i || step.type !== 'block') return step
    const sections = step.sections.map((s, n) =>
      n === section ? { ...s, steps: editList(s.steps, path.slice(2), edit) } : s,
    )
    return { ...step, sections }
  })
}

function withSteps(d: SequenceDiagram, steps: SequenceStep[]): SequenceDiagram {
  return { ...d, steps }
}

/** Replaces the step at `id` (a block keeps its sections' steps unless `step` brings its own). */
function setStep(diagram: SequenceDiagram, id: string, step: SequenceStep): SequenceDiagram {
  const path = stepPath(id)
  if (!path || !stepAt(diagram.steps, path)) return diagram
  return withSteps(
    diagram,
    editList(diagram.steps, path, (list, i) => list.map((s, k) => (k === i ? step : s))),
  )
}

interface StepResult {
  diagram: SequenceDiagram
  /** The step added or moved, by its (new) id. */
  id: string
}

/**
 * Where a new step goes. After the selected step; at the end of a selected block's last section;
 * at the end of the diagram when no step is selected.
 */
function placeFor(diagram: SequenceDiagram, near: string | undefined): number[] {
  const path = near ? stepPath(near) : null
  const step = path ? stepAt(diagram.steps, path) : undefined
  if (!path || !step) return [diagram.steps.length]
  if (step.type === 'block') {
    const last = step.sections.length - 1
    return [...path, last, step.sections[last]?.steps.length ?? 0]
  }
  return [...path.slice(0, -1), (path.at(-1) ?? 0) + 1]
}

/** Puts `steps` in at `path` (the path the first one will have). */
function insertAt(
  diagram: SequenceDiagram,
  path: readonly number[],
  steps: readonly SequenceStep[],
): SequenceDiagram {
  return withSteps(
    diagram,
    editList(diagram.steps, path, (list, i) => [...list.slice(0, i), ...steps, ...list.slice(i)]),
  )
}

/** Adds a step after `near` (see `placeFor`); gives the diagram and the new step's id. */
function insertStep(diagram: SequenceDiagram, step: SequenceStep, near?: string): StepResult {
  const path = placeFor(diagram, near)
  return { diagram: insertAt(diagram, path, [step]), id: stepId(path) }
}

interface MessageInput {
  from: string
  to: string
  text?: string
  arrow?: SequenceArrow
}

/** Adds a message between two participants, after `near`; unchanged when either is unknown. */
function insertMessage(diagram: SequenceDiagram, input: MessageInput, near?: string): StepResult {
  const ids = new Set(diagram.participants.map((p) => p.id))
  if (!ids.has(input.from) || !ids.has(input.to)) return { diagram, id: near ?? '' }
  const step: SequenceStep = {
    type: 'message',
    from: input.from,
    to: input.to,
    text: input.text?.trim() ?? '',
    arrow: input.arrow ?? 'sync',
  }
  return insertStep(diagram, step, near)
}

/** Who a new note is about: the selected participant, a selected message's two ends, or the first. */
function noteTarget(
  diagram: SequenceDiagram,
  near: string | undefined,
): Pick<Extract<SequenceStep, { type: 'note' }>, 'position' | 'participants'> | null {
  const picked = diagram.participants.find((p) => p.id === near)
  if (picked) return { position: 'right', participants: [picked.id] }
  const step = near ? stepOf(diagram, near) : undefined
  if (step?.type === 'message' && step.from !== step.to)
    return { position: 'over', participants: [step.from, step.to] }
  if (step?.type === 'message') return { position: 'right', participants: [step.from] }
  const first = diagram.participants.at(0)
  return first ? { position: 'right', participants: [first.id] } : null
}

/** Adds a note next to what's selected (see `noteTarget`); unchanged with no participant. */
function insertNote(diagram: SequenceDiagram, text: string, near?: string): StepResult {
  const target = noteTarget(diagram, near)
  if (!target) return { diagram, id: near ?? '' }
  const after = near && stepPath(near) ? near : undefined
  return insertStep(diagram, { type: 'note', ...target, text }, after)
}

const SECTIONS: Record<SequenceBlockKind, number> = {
  loop: 1,
  alt: 2,
  opt: 1,
  par: 2,
  critical: 1,
  break: 1,
}

/** Blocks that can hold more than one section: `alt` / else, `par` / and, `critical` / option. */
function canAddSection(kind: SequenceBlockKind): boolean {
  return kind === 'alt' || kind === 'par' || kind === 'critical'
}

/**
 * Adds a block. With a step selected the block goes round it (the step moves inside); otherwise
 * it's added empty at the end. `alt` and `par` start with two sections.
 */
function insertBlock(diagram: SequenceDiagram, kind: SequenceBlockKind, near?: string): StepResult {
  const path = near ? stepPath(near) : null
  const step = path ? stepAt(diagram.steps, path) : undefined
  const empty = () => ({ label: '', steps: [] as SequenceStep[] })
  const sections = Array.from({ length: SECTIONS[kind] }, empty)
  if (!path || !step) {
    const block: Block = { type: 'block', kind, sections }
    return insertStep(diagram, block)
  }
  const [first, ...others] = sections
  const block: Block = {
    type: 'block',
    kind,
    sections: [{ ...empty(), ...first, steps: [step] }, ...others],
  }
  return { diagram: setStep(diagram, stepId(path), block), id: stepId(path) }
}

/** Adds an empty section at the end of the block at `id` (`else`, `and`, `option`). */
function addSection(diagram: SequenceDiagram, id: string): SequenceDiagram {
  const block = stepOf(diagram, id)
  if (block?.type !== 'block' || !canAddSection(block.kind)) return diagram
  return setStep(diagram, id, { ...block, sections: [...block.sections, { label: '', steps: [] }] })
}

/** Removes a block's section (not the first); its steps join the section before it. */
function removeSection(diagram: SequenceDiagram, id: string, index: number): SequenceDiagram {
  const block = stepOf(diagram, id)
  if (block?.type !== 'block' || index < 1 || index >= block.sections.length) return diagram
  const moved = block.sections[index]?.steps ?? []
  const sections = block.sections
    .map((s, n) => (n === index - 1 ? { ...s, steps: [...s.steps, ...moved] } : s))
    .filter((_, n) => n !== index)
  return setStep(diagram, id, { ...block, sections })
}

/** Moves a step one place up (-1) or down (1) in its list; gives its new id. */
function moveStep(diagram: SequenceDiagram, id: string, delta: -1 | 1): StepResult {
  const path = stepPath(id)
  if (!path || !stepAt(diagram.steps, path)) return { diagram, id }
  const target = (path.at(-1) ?? 0) + delta
  if (target < 0 || target >= listOf(diagram.steps, path).length) return { diagram, id }
  const steps = editList(diagram.steps, path, (list, i) => {
    const out = [...list]
    out.splice(target, 0, ...out.splice(i, 1))
    return out
  })
  return { diagram: withSteps(diagram, steps), id: stepId([...path.slice(0, -1), target]) }
}

/**
 * The steps without those picked (by id) and without what touches a removed participant: its
 * messages and activations; notes keep the participants that stay.
 */
function keepSteps(
  steps: readonly SequenceStep[],
  removed: ReadonlySet<string>,
  prefix: readonly number[] = [],
): SequenceStep[] {
  const out: SequenceStep[] = []
  for (const [i, step] of steps.entries()) {
    const path = [...prefix, i]
    if (removed.has(stepId(path))) continue
    const kept = keepStep(step, removed, path)
    if (kept) out.push(kept)
  }
  return out
}

function keepStep(
  step: SequenceStep,
  removed: ReadonlySet<string>,
  path: readonly number[],
): SequenceStep | null {
  switch (step.type) {
    case 'message':
      return removed.has(step.from) || removed.has(step.to) ? null : step
    case 'activation':
      return removed.has(step.participant) ? null : step
    case 'note': {
      const participants = step.participants.filter((p) => !removed.has(p))
      return participants.length ? { ...step, participants } : null
    }
    case 'block':
      return {
        ...step,
        sections: step.sections.map((s, n) => ({
          ...s,
          steps: keepSteps(s.steps, removed, [...path, n]),
        })),
      }
  }
}

/** The participants a sequence diagram can name in a step, for a picker. */
function participantOptions(diagram: SequenceDiagram): { id: string; name: string }[] {
  return diagram.participants.map((p: SequenceParticipant) => ({ id: p.id, name: p.label ?? p.id }))
}

export {
  addSection,
  canAddSection,
  insertAt,
  insertBlock,
  insertMessage,
  insertNote,
  insertStep,
  keepSteps,
  listOf,
  type MessageInput,
  moveStep,
  participantOptions,
  placeFor,
  removeSection,
  setStep,
  stepAt,
  stepId,
  stepIds,
  stepOf,
  stepPath,
  type StepResult,
}
