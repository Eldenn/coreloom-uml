// The parts of a diagram (its elements, their members, its relations, a sequence's steps), each
// with the one line that names it. It mirrors what coreloom-ui's drawing names on a right-click
// (`uml-diagram-labels.ts` over `uml-graph*.ts` in `apps/web`), which the web sends as the
// assistant's `pointed` parts: a part is the same (type, label) pair here and there, so a part
// named once can be looked for again in a later version of its view. Keep both in step; a test in
// `apps/web` compares them.

import type { SequenceDiagram, SequenceStep, UmlNote, UmlSpec } from './uml.ts'
import type { ElementDiagram } from './uml-elements.ts'

type UmlPartType = 'element' | 'relation' | 'member' | 'step'

/** A part of a diagram and the line that names it: `Payment`, `Order → Payment: pays`. */
interface UmlPart {
  type: UmlPartType
  label: string
}

/**
 * The word an element without a name goes by (a start, a fork, an unnamed decision), as
 * coreloom-ui's English messages have it (`diagram.roles`).
 */
const UML_PART_ROLES = {
  class: 'Class',
  note: 'Note',
  namespace: 'Namespace',
  state: 'State',
  composite: 'Composite state',
  start: 'Start',
  end: 'End',
  choice: 'Choice',
  fork: 'Fork',
  join: 'Join',
  entity: 'Entity',
  person: 'Person',
  system: 'Software System',
  container: 'Container',
  component: 'Component',
  boundary: 'Boundary',
  actor: 'Actor',
  usecase: 'Use case',
  subject: 'System',
  action: 'Action',
  decision: 'Decision',
  merge: 'Merge',
  flowEnd: 'Flow end',
  partition: 'Partition',
  node: 'Node',
  device: 'Device',
  environment: 'Execution environment',
  artifact: 'Artifact',
  database: 'Database',
  cloud: 'Cloud',
  interface: 'Interface',
  port: 'Port',
  package: 'Package',
} as const

type UmlPartRole = keyof typeof UML_PART_ROLES

/** Newlines and runs of spaces become one space. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

interface Node {
  id: string
  role: UmlPartRole
  title: string
  body?: string | undefined
  /** Members, in their order across compartments: `text`, then `: suffix` when there is one. */
  rows?: { text: string; suffix?: string | undefined }[]
}

interface Edge {
  from: string
  to: string
  label?: string | undefined
}

const noteNodes = (notes: readonly UmlNote[] | undefined): Node[] =>
  (notes ?? []).map((note, i) => ({
    id: `note:${String(i)}`,
    role: 'note',
    title: '',
    body: note.text,
  }))

/** The keyword and the label, as one line: `«include» checks stock`. */
const joined = (keyword: string | undefined, label: string | undefined) =>
  [keyword, label].filter(Boolean).join('\n') || undefined

/** A guard reads in brackets, `[paid]`, however it was written. */
function guard(label: string | undefined) {
  const text = label?.trim()
  if (!text) return undefined
  return text.startsWith('[') ? text : `[${text}]`
}

const ELEMENT_KEYWORDS: Record<string, string | undefined> = {
  include: '«include»',
  extend: '«extend»',
  deploy: '«deploy»',
  delegate: '«delegate»',
  import: '«import»',
  merge: '«merge»',
}

function elementGraph(d: ElementDiagram): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = d.elements.map((e): Node => {
    switch (d.kind) {
      case 'usecase': {
        const kind = (e as { kind: 'actor' | 'usecase' | 'system' }).kind
        return { id: e.id, role: kind === 'system' ? 'subject' : kind, title: e.label ?? e.id }
      }
      case 'activity': {
        const kind = (e as { kind: string }).kind
        const named = kind === 'action' || kind === 'partition'
        return {
          id: e.id,
          role: kind as UmlPartRole,
          title: named ? (e.label ?? e.id) : (e.label ?? ''),
        }
      }
      default:
        return { id: e.id, role: (e as { kind: UmlPartRole }).kind, title: e.label ?? e.id }
    }
  })
  const edges = d.relations.map(
    (r: { from: string; to: string; kind?: string; label?: string }): Edge => ({
      from: r.from,
      to: r.to,
      label:
        d.kind === 'activity' ? guard(r.label) : joined(ELEMENT_KEYWORDS[r.kind ?? ''], r.label),
    }),
  )
  return { nodes: [...nodes, ...noteNodes(d.notes)], edges }
}

/** A start or end's id in a state diagram: one per scope and region, as the drawing has it. */
const pseudo = (kind: 'start' | 'end', scope: string | undefined, region: number) =>
  `[*]${kind}:${scope ?? ''}${region ? `:${String(region)}` : ''}`

/** The nodes and relations of every kind but sequence, as coreloom-ui's canvas draws them. */
function graphOf(d: Exclude<UmlSpec, SequenceDiagram>): { nodes: Node[]; edges: Edge[] } {
  switch (d.kind) {
    case 'class': {
      const namespaces = [...new Set(d.classes.flatMap((c) => (c.namespace ? [c.namespace] : [])))]
      const nodes: Node[] = namespaces.map((ns) => ({
        id: `namespace:${ns}`,
        role: 'namespace',
        title: ns,
      }))
      for (const c of d.classes)
        nodes.push({
          id: c.id,
          role: 'class',
          title: `${c.label ?? c.id}${c.generic ? `<${c.generic}>` : ''}`,
          rows: [...(c.attributes ?? []), ...(c.methods ?? [])].map((m) => ({ text: m.text })),
        })
      return {
        nodes: [...nodes, ...noteNodes(d.notes)],
        edges: d.relations.map((r) => ({ from: r.from, to: r.to, label: r.label })),
      }
    }
    case 'state': {
      const states = d.states.map((s): Node & { parent?: string; region?: number } => {
        const composite = d.states.some((c) => c.parent === s.id)
        const kind = s.kind ?? 'state'
        const role: UmlPartRole = kind === 'state' ? (composite ? 'composite' : 'state') : kind
        return {
          id: s.id,
          role,
          title: s.label ?? s.id,
          body: kind === 'state' && !composite ? s.description : undefined,
          ...(s.parent ? { parent: s.parent, region: s.region ?? 0 } : {}),
        }
      })
      const used = new Map<string, Node>()
      const end = (id: string, kind: 'start' | 'end', scope: string | undefined, other: string) => {
        if (id !== '[*]') return id
        const region =
          (scope ? states.find((n) => n.id === other && n.parent === scope)?.region : 0) ?? 0
        const key = pseudo(kind, scope, region)
        if (!used.has(key)) used.set(key, { id: key, role: kind, title: '' })
        return key
      }
      const edges = d.transitions.map((t) => ({
        from: end(t.from, 'start', t.parent, t.to),
        to: end(t.to, 'end', t.parent, t.from),
        label: t.label,
      }))
      return { nodes: [...used.values(), ...states, ...noteNodes(d.notes)], edges }
    }
    case 'er':
      return {
        nodes: d.entities.map((e) => ({
          id: e.id,
          role: 'entity',
          title: e.label ?? e.id,
          rows: (e.attributes ?? []).map((a) => ({ text: a.name, suffix: a.type })),
        })),
        edges: d.relations.map((r) => ({ from: r.from, to: r.to, label: r.label })),
      }
    case 'c4':
      return {
        nodes: [
          ...(d.boundaries ?? []).map(
            (b): Node => ({ id: b.id, role: 'boundary', title: b.label }),
          ),
          ...d.elements.map(
            (e): Node => ({ id: e.id, role: e.kind, title: e.label, body: e.description }),
          ),
        ],
        edges: d.relations.map((r) => ({ from: r.from, to: r.to, label: r.label })),
      }
    default:
      return elementGraph(d)
  }
}

const DASHED: ReadonlySet<string> = new Set(['reply', 'dottedLine', 'dottedLost', 'dottedAsync'])

/** `Client -> API: login()`, `Note over API, DB: cached`, `activate API`, `loop every minute`. */
function stepLabel(step: SequenceStep, name: (id: string) => string): string {
  switch (step.type) {
    case 'message': {
      const line = `${name(step.from)} ${DASHED.has(step.arrow) ? '-->' : '->'} ${name(step.to)}`
      return step.text ? `${line}: ${oneLine(step.text)}` : line
    }
    case 'note': {
      const where = step.position === 'over' ? 'over' : `${step.position} of`
      return `Note ${where} ${step.participants.map(name).join(', ')}: ${oneLine(step.text)}`
    }
    case 'activation':
      return `${step.active ? 'activate' : 'deactivate'} ${name(step.participant)}`
    case 'block':
      return oneLine(`${step.kind} ${step.sections[0]?.label ?? ''}`)
  }
}

function sequenceParts(d: SequenceDiagram): UmlPart[] {
  const names = new Map(d.participants.map((p) => [p.id, oneLine(p.label ?? p.id)]))
  const name = (who: string) => names.get(who) ?? who
  const steps = (list: readonly SequenceStep[]): UmlPart[] =>
    list.flatMap((step) => [
      { type: 'step' as const, label: stepLabel(step, name) },
      ...(step.type === 'block' ? step.sections.flatMap((section) => steps(section.steps)) : []),
    ])
  return [
    ...d.participants.map((p) => ({ type: 'element' as const, label: name(p.id) })),
    ...steps(d.steps),
  ]
}

/**
 * Every part of a diagram, in drawing order (elements with their members, then relations), each
 * once. `roleName` names an element that has none; coreloom-ui's English words by default.
 */
function umlParts(
  diagram: UmlSpec,
  roleName: (role: UmlPartRole) => string = (role) => UML_PART_ROLES[role],
): UmlPart[] {
  const parts =
    diagram.kind === 'sequence'
      ? sequenceParts(diagram)
      : (() => {
          const { nodes, edges } = graphOf(diagram)
          const byId = new Map(nodes.map((node) => [node.id, node]))
          const elementLabel = (node: Node) =>
            oneLine(node.title || (node.body ?? '')) || roleName(node.role)
          const name = (id: string) => {
            const node = byId.get(id)
            return node ? elementLabel(node) : id
          }
          return [
            ...nodes.flatMap((node): UmlPart[] => [
              { type: 'element', label: elementLabel(node) },
              ...(node.rows ?? []).map(
                (row): UmlPart => ({
                  type: 'member',
                  label: `${elementLabel(node)}.${oneLine(row.suffix ? `${row.text}: ${row.suffix}` : row.text)}`,
                }),
              ),
            ]),
            ...edges.map((edge): UmlPart => {
              const ends = `${name(edge.from)} → ${name(edge.to)}`
              return {
                type: 'relation',
                label: edge.label ? `${ends}: ${oneLine(edge.label)}` : ends,
              }
            }),
          ]
        })()
  const seen = new Set<string>()
  return parts.filter((part) => {
    const key = `${part.type}\n${part.label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Whether `diagram` still has a part of this type and label. */
function hasUmlPart(diagram: UmlSpec, part: UmlPart): boolean {
  return umlParts(diagram).some((own) => own.type === part.type && own.label === part.label)
}

export { hasUmlPart, UML_PART_ROLES, type UmlPart, type UmlPartRole, type UmlPartType, umlParts }
