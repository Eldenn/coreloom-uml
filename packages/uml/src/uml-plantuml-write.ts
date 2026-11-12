// Coreloom UML — writing PlantUML. `toPlantUml` gives any diagram as `@startuml` text: classes with
// their members and relations, states, sequence steps, entities with crow's feet, C4 through the
// C4-PlantUML macros, use cases, deployment nodes, and activities in PlantUML's arrow syntax.
// Positions people dragged go in a `' coreloom-layout {…}` comment line before `@enduml`.
import type {
  C4Diagram,
  ClassDiagram,
  ClassMember,
  ClassRelation,
  ErDiagram,
  SequenceArrow,
  SequenceDiagram,
  SequenceStep,
  StateDiagram,
  UmlDirection,
  UmlNote,
  UmlSpec,
  UmlState,
} from './uml.ts'
import { c4ToMermaid } from './uml-mermaid-c4.ts'
import { erRelationMarks } from './uml-mermaid-er.ts'
import { stateRegions } from './uml-mermaid-state.ts'
import { activityToPlantUml } from './uml-plantuml-activity.ts'
import { deploymentToPlantUml, usecaseToPlantUml, wrap } from './uml-plantuml-elements.ts'
import { componentToPlantUml, packageToPlantUml } from './uml-plantuml-structure.ts'
import { layoutLine } from './uml-text.ts'

/** Text PlantUML reads on one line: line breaks as `\n`. */
const flat = (text: string) => text.replace(/\r?\n/g, '\\n')
/** A quoted name: quotes inside become apostrophes. */
const q = (text: string) => `"${flat(text).replace(/"/g, "'")}"`

function direction(d: UmlDirection | undefined): string[] {
  return d === 'LR' || d === 'RL' ? ['left to right direction'] : []
}

function notes(list: readonly UmlNote[] | undefined): string[] {
  return (list ?? []).map((n, i) =>
    n.for ? `note right of ${n.for} : ${flat(n.text)}` : `note ${q(n.text)} as N${String(i + 1)}`,
  )
}

// ── Class ───────────────────────────────────────────────────────────────────────────────────────

const SIGN = { public: '+', private: '-', protected: '#', package: '~' } as const

function memberLine(m: ClassMember): string {
  const modifier = [m.static ? '{static} ' : '', m.abstract ? '{abstract} ' : ''].join('')
  return `${modifier}${m.visibility ? SIGN[m.visibility] : ''}${m.text}`
}

/** The arrow from `from` to `to`, with the marker on the `to` side. */
const CLASS_ARROWS: Record<ClassRelation['kind'], string> = {
  inheritance: '--|>',
  realization: '..|>',
  composition: '--*',
  aggregation: '--o',
  association: '-->',
  dependency: '..>',
  link: '--',
  dashedLink: '..',
}

function classToPlantUml(d: ClassDiagram): string {
  const keyword = (stereotype: string | undefined) => {
    switch (stereotype?.toLowerCase()) {
      case 'interface':
        return { word: 'interface', stereo: '' }
      case 'abstract':
        return { word: 'abstract class', stereo: '' }
      case 'enumeration':
      case 'enum':
        return { word: 'enum', stereo: '' }
      default:
        return { word: 'class', stereo: stereotype ? ` <<${stereotype}>>` : '' }
    }
  }
  const classLines = (pad: string, cls: ClassDiagram['classes']) =>
    cls.flatMap((c) => {
      const { word, stereo } = keyword(c.stereotype)
      const name = `${c.label ? `${q(c.label)} as ` : ''}${c.id}${c.generic ? `<${c.generic}>` : ''}`
      const members = [...(c.attributes ?? []), ...(c.methods ?? [])]
      if (!members.length) return [`${pad}${word} ${name}${stereo}`]
      return [
        `${pad}${word} ${name}${stereo} {`,
        ...members.map((m) => `${pad}  ${memberLine(m)}`),
        `${pad}}`,
      ]
    })
  const namespaces = [...new Set(d.classes.flatMap((c) => (c.namespace ? [c.namespace] : [])))]
  const relations = d.relations.map((r) => {
    const from = r.fromCardinality ? ` ${q(r.fromCardinality)}` : ''
    const to = r.toCardinality ? `${q(r.toCardinality)} ` : ''
    return `${r.from}${from} ${CLASS_ARROWS[r.kind]} ${to}${r.to}${r.label ? ` : ${flat(r.label)}` : ''}`
  })
  return wrap(d.title, [
    ...direction(d.direction),
    ...classLines(
      '',
      d.classes.filter((c) => !c.namespace),
    ),
    ...namespaces.flatMap((ns) => [
      `package ${ns} {`,
      ...classLines(
        '  ',
        d.classes.filter((c) => c.namespace === ns),
      ),
      '}',
    ]),
    ...relations,
    ...notes(d.notes),
  ])
}

// ── State ───────────────────────────────────────────────────────────────────────────────────────

function stateToPlantUml(d: StateDiagram): string {
  const scope = (parent: string | undefined, pad: string): string[] => {
    const state = (s: UmlState): string[] => {
      const name = s.label ? `${q(s.label)} as ${s.id}` : s.id
      if (s.kind && s.kind !== 'state') return [`${pad}state ${s.id} <<${s.kind}>>`]
      const inner = scope(s.id, `${pad}  `)
      const head = `${pad}state ${name}`
      const desc = s.description ? [`${pad}${s.id} : ${flat(s.description)}`] : []
      return inner.length ? [`${head} {`, ...inner, `${pad}}`, ...desc] : [head, ...desc]
    }
    // Only `[*]` needs its composite state around it; other transitions can name nested states.
    const transitions = d.transitions.filter((t) => t.parent === parent)
    return stateRegions(d, parent, transitions).flatMap((r, i) => [
      ...(i ? [`${pad}--`] : []),
      ...r.states.flatMap(state),
      ...r.transitions.map(
        (t) => `${pad}${t.from} --> ${t.to}${t.label ? ` : ${flat(t.label)}` : ''}`,
      ),
    ])
  }
  return wrap(d.title, [...direction(d.direction), ...scope(undefined, ''), ...notes(d.notes)])
}

// ── Sequence ────────────────────────────────────────────────────────────────────────────────────

const SEQUENCE_ARROWS: Record<SequenceArrow, string> = {
  sync: '->',
  reply: '-->',
  line: '->',
  dottedLine: '-->',
  lost: '->x',
  dottedLost: '-->x',
  async: '->>',
  dottedAsync: '-->>',
}

function stepLines(step: SequenceStep, pad: string): string[] {
  switch (step.type) {
    case 'message': {
      const mark = [step.activate ? ' ++' : '', step.deactivate ? ' --' : ''].join('')
      return [
        `${pad}${step.from} ${SEQUENCE_ARROWS[step.arrow]} ${step.to}${mark} : ${flat(step.text)}`,
      ]
    }
    case 'note': {
      const where = step.position === 'over' ? 'over' : `${step.position} of`
      return [`${pad}note ${where} ${step.participants.join(', ')} : ${flat(step.text)}`]
    }
    case 'activation':
      return [`${pad}${step.active ? 'activate' : 'deactivate'} ${step.participant}`]
    case 'block':
      return [
        ...step.sections.flatMap((section, i) => [
          `${pad}${i === 0 ? step.kind : 'else'}${section.label ? ` ${flat(section.label)}` : ''}`,
          ...section.steps.flatMap((s) => stepLines(s, `${pad}  `)),
        ]),
        `${pad}end`,
      ]
  }
}

function sequenceToPlantUml(d: SequenceDiagram): string {
  return wrap(d.title, [
    ...(d.autonumber ? ['autonumber'] : []),
    ...d.participants.map(
      (p) => `${p.kind ?? 'participant'} ${p.label ? `${q(p.label)} as ` : ''}${p.id}`,
    ),
    ...d.steps.flatMap((s) => stepLines(s, '')),
  ])
}

// ── ER and C4 ───────────────────────────────────────────────────────────────────────────────────

function erToPlantUml(d: ErDiagram): string {
  const entities = d.entities.flatMap((e) => {
    const head = `entity ${e.label ? `${q(e.label)} as ` : ''}${e.id}`
    if (!e.attributes?.length) return [head]
    const rows = e.attributes.map((a) => {
      const keys = (a.keys ?? []).map((k) => ` <<${k}>>`).join('')
      return `  ${a.keys?.includes('PK') ? '*' : ''}${a.name} : ${a.type}${keys}`
    })
    return [`${head} {`, ...rows, '}']
  })
  const relations = d.relations.map(
    (r) => `${r.from} ${erRelationMarks(r)} ${r.to}${r.label ? ` : ${flat(r.label)}` : ''}`,
  )
  return wrap(d.title, [...direction(d.direction), ...entities, ...relations])
}

const C4_INCLUDE = {
  context: 'C4_Context',
  container: 'C4_Container',
  component: 'C4_Component',
} as const

/** The C4-PlantUML macros are Mermaid's C4 macros: only the header and the include differ. */
function c4ToPlantUml(d: C4Diagram): string {
  const body = c4ToMermaid({ ...d, title: '' })
    .split('\n')
    .slice(1)
  return wrap(d.title, [
    `!include <C4/${C4_INCLUDE[d.level]}>`,
    ...body.map((l) => l.replace(/^ {2}/, '')),
  ])
}

/**
 * The diagram as PlantUML text, between `@startuml` and `@enduml`. `layout: false` leaves out the
 * comment line that keeps the positions (for a reader that only needs the model).
 */
function toPlantUml(diagram: UmlSpec, options: { layout?: boolean } = {}): string {
  const text = plantText(diagram)
  const line = options.layout === false ? null : layoutLine(diagram, "'")
  if (!line) return text
  // Inside the diagram: PlantUML reads nothing after @enduml.
  const end = text.lastIndexOf('@enduml')
  return end < 0 ? `${text}\n${line}` : `${text.slice(0, end)}${line}\n${text.slice(end)}`
}

function plantText(diagram: UmlSpec): string {
  switch (diagram.kind) {
    case 'class':
      return classToPlantUml(diagram)
    case 'state':
      return stateToPlantUml(diagram)
    case 'sequence':
      return sequenceToPlantUml(diagram)
    case 'er':
      return erToPlantUml(diagram)
    case 'c4':
      return c4ToPlantUml(diagram)
    case 'usecase':
      return usecaseToPlantUml(diagram)
    case 'activity':
      return activityToPlantUml(diagram)
    case 'deployment':
      return deploymentToPlantUml(diagram)
    case 'component':
      return componentToPlantUml(diagram)
    case 'package':
      return packageToPlantUml(diagram)
  }
}

export { toPlantUml }
