import { z } from 'zod'

import {
  type ActivityDiagram,
  activitySchema,
  type ComponentDiagram,
  componentSchema,
  type DeploymentDiagram,
  deploymentSchema,
  direction,
  id,
  layout,
  notes,
  type PackageDiagram,
  packageSchema,
  text,
  type UseCaseDiagram,
  usecaseSchema,
} from './uml-elements.ts'

/** Where the layout flows: top to bottom, bottom to top, left to right, right to left. */
type UmlDirection = 'TB' | 'BT' | 'LR' | 'RL'

/** A node's place on the canvas, set when someone drags it; inside a frame it's relative to it. */
interface UmlPoint {
  x: number
  y: number
}

/** Positions people chose by dragging, by element id. Everything else is laid out automatically. */
type UmlLayout = Record<string, UmlPoint>

/** A note pinned to an element (or floating, without `for`). */
interface UmlNote {
  text: string
  for?: string
}

// ── Class diagram ───────────────────────────────────────────────────────────────────────────────

type ClassVisibility = 'public' | 'private' | 'protected' | 'package'

/** One line of a class: an attribute (`String name`) or a method (`getName() String`). */
interface ClassMember {
  /** The member as written, without its visibility sign. */
  text: string
  visibility?: ClassVisibility
  /** Underlined in the diagram. */
  static?: boolean
  /** In italics in the diagram. */
  abstract?: boolean
}

interface UmlClass {
  id: string
  /** Shown instead of the id. */
  label?: string
  /** Type parameters, `T` for `List~T~`. */
  generic?: string
  /** `interface`, `abstract`, `enumeration`, `service`… shown as «interface». */
  stereotype?: string
  attributes?: ClassMember[]
  methods?: ClassMember[]
  /** The namespace (package) it belongs to. */
  namespace?: string
}

/**
 * How two classes are related. The marker sits at `to`: the parent of an inheritance or
 * realization, the whole of a composition or aggregation, the target of an association or a
 * dependency.
 */
type ClassRelationKind =
  | 'inheritance'
  | 'realization'
  | 'composition'
  | 'aggregation'
  | 'association'
  | 'dependency'
  | 'link'
  | 'dashedLink'

interface ClassRelation {
  from: string
  to: string
  kind: ClassRelationKind
  label?: string
  /** Multiplicity at the `from` end: `1`, `0..1`, `*`, `1..*`. */
  fromCardinality?: string
  toCardinality?: string
}

interface ClassDiagram {
  kind: 'class'
  title?: string
  direction?: UmlDirection
  classes: UmlClass[]
  relations: ClassRelation[]
  notes?: UmlNote[]
  layout?: UmlLayout
}

// ── State diagram ───────────────────────────────────────────────────────────────────────────────

type StateKind = 'state' | 'choice' | 'fork' | 'join'

interface UmlState {
  id: string
  label?: string
  /** Default: state. */
  kind?: StateKind
  /** What the state does or means, under its name. */
  description?: string
  /** The composite state it sits in. A state with states inside it is composite. */
  parent?: string
}

/** `[*]` as `from` is the start of the scope (`parent`, or the whole diagram); as `to`, its end. */
interface StateTransition {
  from: string
  to: string
  label?: string
  /** The composite state whose `[*]` start and end this transition uses. */
  parent?: string
}

interface StateDiagram {
  kind: 'state'
  title?: string
  direction?: UmlDirection
  states: UmlState[]
  transitions: StateTransition[]
  notes?: UmlNote[]
  layout?: UmlLayout
}

// ── Entity–relationship diagram ─────────────────────────────────────────────────────────────────

type ErKey = 'PK' | 'FK' | 'UK'

interface ErAttribute {
  type: string
  name: string
  keys?: ErKey[]
  comment?: string
}

interface ErEntity {
  id: string
  label?: string
  attributes?: ErAttribute[]
}

/** How many of one side relate to one of the other (crow's foot notation). */
type ErCardinality = 'zeroOrOne' | 'exactlyOne' | 'zeroOrMore' | 'oneOrMore'

interface ErRelation {
  from: string
  to: string
  fromCardinality: ErCardinality
  toCardinality: ErCardinality
  label: string
  /** A solid line: the child can't exist without the parent. Default: true. */
  identifying?: boolean
}

interface ErDiagram {
  kind: 'er'
  title?: string
  direction?: UmlDirection
  entities: ErEntity[]
  relations: ErRelation[]
  layout?: UmlLayout
}

// ── Sequence diagram ────────────────────────────────────────────────────────────────────────────

interface SequenceParticipant {
  id: string
  label?: string
  /** An actor is drawn as a person. Default: participant. */
  kind?: 'participant' | 'actor'
}

/**
 * The line and head of a message: `sync` ->>, `reply` -->>, `line` ->, `dottedLine` -->,
 * `lost` -x, `dottedLost` --x, `async` -), `dottedAsync` --).
 */
type SequenceArrow =
  | 'sync'
  | 'reply'
  | 'line'
  | 'dottedLine'
  | 'lost'
  | 'dottedLost'
  | 'async'
  | 'dottedAsync'

type SequenceBlockKind = 'loop' | 'alt' | 'opt' | 'par' | 'critical' | 'break'

type SequenceStep =
  | {
      type: 'message'
      from: string
      to: string
      text: string
      arrow: SequenceArrow
      /** `+` in Mermaid: the target becomes active. */
      activate?: boolean
      /** `-` in Mermaid: the sender stops being active. */
      deactivate?: boolean
    }
  | { type: 'note'; position: 'left' | 'right' | 'over'; participants: string[]; text: string }
  | { type: 'activation'; participant: string; active: boolean }
  | {
      type: 'block'
      kind: SequenceBlockKind
      /** The first section is the block itself; `alt` adds `else`, `par` `and`, `critical` `option`. */
      sections: { label: string; steps: SequenceStep[] }[]
    }

interface SequenceDiagram {
  kind: 'sequence'
  title?: string
  /** Number the messages. */
  autonumber?: boolean
  participants: SequenceParticipant[]
  steps: SequenceStep[]
}

// ── C4 ──────────────────────────────────────────────────────────────────────────────────────────

type C4Level = 'context' | 'container' | 'component'
type C4ElementKind = 'person' | 'system' | 'container' | 'component'

interface C4Element {
  id: string
  kind: C4ElementKind
  label: string
  description?: string
  /** Containers and components: `React`, `PostgreSQL`, `Go service`. */
  technology?: string
  /** Outside what the diagram is about: another team's system, a customer. */
  external?: boolean
  /** Default: box. */
  shape?: 'box' | 'database' | 'queue'
  boundary?: string
}

interface C4Boundary {
  id: string
  label: string
  /** Default: boundary. */
  kind?: 'enterprise' | 'system' | 'container' | 'boundary'
  /** Inside another boundary. */
  parent?: string
}

interface C4Relation {
  from: string
  to: string
  label?: string
  technology?: string
  bidirectional?: boolean
}

interface C4Diagram {
  kind: 'c4'
  level: C4Level
  title?: string
  direction?: UmlDirection
  elements: C4Element[]
  boundaries?: C4Boundary[]
  relations: C4Relation[]
  layout?: UmlLayout
}

type UmlSpec =
  | ClassDiagram
  | SequenceDiagram
  | StateDiagram
  | ErDiagram
  | C4Diagram
  | UseCaseDiagram
  | ActivityDiagram
  | DeploymentDiagram
  | ComponentDiagram
  | PackageDiagram
type UmlDiagramKind = UmlSpec['kind']

/**
 * Something the parser couldn't read, or read and set aside. `code` says which (the UI words it
 * in the reader's language); `text` is the part of the line it's about.
 */
interface UmlProblem {
  /** 1-based; 0 when it's about the whole text. */
  line: number
  severity: 'error' | 'warning'
  code:
    | 'empty'
    | 'header'
    | 'syntax'
    | 'unclosed'
    | 'unexpected'
    | 'unsupported'
    | 'json'
    | 'schema'
  text?: string
}

/** What parsing gives: the diagram it could read (null when it couldn't tell which), and problems. */
type UmlParseResult =
  | { diagram: UmlSpec; problems: UmlProblem[] }
  | { diagram: null; problems: UmlProblem[] }

// ── JSON ────────────────────────────────────────────────────────────────────────────────────────

const member = z.object({
  text,
  visibility: z.enum(['public', 'private', 'protected', 'package']).optional(),
  static: z.boolean().optional(),
  abstract: z.boolean().optional(),
})

const classSchema = z.object({
  kind: z.literal('class'),
  title: text.optional(),
  direction,
  classes: z.array(
    z.object({
      id,
      label: text.optional(),
      generic: text.optional(),
      stereotype: text.optional(),
      attributes: z.array(member).optional(),
      methods: z.array(member).optional(),
      namespace: id.optional(),
    }),
  ),
  relations: z.array(
    z.object({
      from: id,
      to: id,
      kind: z.enum([
        'inheritance',
        'realization',
        'composition',
        'aggregation',
        'association',
        'dependency',
        'link',
        'dashedLink',
      ]),
      label: text.optional(),
      fromCardinality: text.optional(),
      toCardinality: text.optional(),
    }),
  ),
  notes,
  layout,
})

const stateSchema = z.object({
  kind: z.literal('state'),
  title: text.optional(),
  direction,
  states: z.array(
    z.object({
      id,
      label: text.optional(),
      kind: z.enum(['state', 'choice', 'fork', 'join']).optional(),
      description: text.optional(),
      parent: id.optional(),
    }),
  ),
  transitions: z.array(
    z.object({ from: id, to: id, label: text.optional(), parent: id.optional() }),
  ),
  notes,
  layout,
})

const cardinality = z.enum(['zeroOrOne', 'exactlyOne', 'zeroOrMore', 'oneOrMore'])

const erSchema = z.object({
  kind: z.literal('er'),
  title: text.optional(),
  direction,
  entities: z.array(
    z.object({
      id,
      label: text.optional(),
      attributes: z
        .array(
          z.object({
            type: text,
            name: text,
            keys: z.array(z.enum(['PK', 'FK', 'UK'])).optional(),
            comment: text.optional(),
          }),
        )
        .optional(),
    }),
  ),
  relations: z.array(
    z.object({
      from: id,
      to: id,
      fromCardinality: cardinality,
      toCardinality: cardinality,
      label: text,
      identifying: z.boolean().optional(),
    }),
  ),
  layout,
})

const stepSchema: z.ZodType<SequenceStep> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('message'),
      from: id,
      to: id,
      text,
      arrow: z.enum([
        'sync',
        'reply',
        'line',
        'dottedLine',
        'lost',
        'dottedLost',
        'async',
        'dottedAsync',
      ]),
      activate: z.boolean().optional(),
      deactivate: z.boolean().optional(),
    }),
    z.object({
      type: z.literal('note'),
      position: z.enum(['left', 'right', 'over']),
      participants: z.array(id).min(1).max(2),
      text,
    }),
    z.object({ type: z.literal('activation'), participant: id, active: z.boolean() }),
    z.object({
      type: z.literal('block'),
      kind: z.enum(['loop', 'alt', 'opt', 'par', 'critical', 'break']),
      sections: z.array(z.object({ label: text, steps: z.array(stepSchema) })).min(1),
    }),
  ]),
)

const sequenceSchema = z.object({
  kind: z.literal('sequence'),
  title: text.optional(),
  autonumber: z.boolean().optional(),
  participants: z.array(
    z.object({ id, label: text.optional(), kind: z.enum(['participant', 'actor']).optional() }),
  ),
  steps: z.array(stepSchema),
})

const c4Schema = z.object({
  kind: z.literal('c4'),
  level: z.enum(['context', 'container', 'component']),
  title: text.optional(),
  direction,
  elements: z.array(
    z.object({
      id,
      kind: z.enum(['person', 'system', 'container', 'component']),
      label: text,
      description: text.optional(),
      technology: text.optional(),
      external: z.boolean().optional(),
      shape: z.enum(['box', 'database', 'queue']).optional(),
      boundary: id.optional(),
    }),
  ),
  boundaries: z
    .array(
      z.object({
        id,
        label: text,
        kind: z.enum(['enterprise', 'system', 'container', 'boundary']).optional(),
        parent: id.optional(),
      }),
    )
    .optional(),
  relations: z.array(
    z.object({
      from: id,
      to: id,
      label: text.optional(),
      technology: text.optional(),
      bidirectional: z.boolean().optional(),
    }),
  ),
  layout,
})

const diagramSchema = z.discriminatedUnion('kind', [
  classSchema,
  sequenceSchema,
  stateSchema,
  erSchema,
  c4Schema,
  usecaseSchema,
  activitySchema,
  deploymentSchema,
  componentSchema,
  packageSchema,
])

/** Reads a diagram from JSON text (pasted, imported, stored), checking every field once. */
function parseUmlJson(input: string): UmlParseResult {
  if (!input.trim())
    return { diagram: null, problems: [{ line: 0, severity: 'error', code: 'empty' }] }
  let raw: unknown
  try {
    raw = JSON.parse(input)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      diagram: null,
      problems: [{ line: 0, severity: 'error', code: 'json', text: message }],
    }
  }
  return parseUmlValue(raw)
}

/** The same check for a value already out of JSON (a fetch result, a model's tool call). */
function parseUmlValue(raw: unknown): UmlParseResult {
  const parsed = diagramSchema.safeParse(raw)
  if (parsed.success) return { diagram: parsed.data, problems: [] }
  return {
    diagram: null,
    problems: parsed.error.issues.slice(0, 20).map((issue) => ({
      line: 0,
      severity: 'error' as const,
      code: 'schema' as const,
      text: issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    })),
  }
}

/** The diagram as JSON text, two-space indented, with its layout when there is one. */
function toUmlJson(diagram: UmlSpec): string {
  return JSON.stringify(diagram, null, 2)
}

/** The ids a diagram's layout can hold positions for (every element it draws as a node). */
function umlElementIds(diagram: UmlSpec): string[] {
  switch (diagram.kind) {
    case 'class':
      return diagram.classes.map((c) => c.id)
    case 'state':
      return diagram.states.map((s) => s.id)
    case 'er':
      return diagram.entities.map((e) => e.id)
    case 'c4':
      return diagram.elements.map((e) => e.id)
    case 'sequence':
      return diagram.participants.map((p) => p.id)
    case 'usecase':
    case 'activity':
    case 'deployment':
    case 'component':
    case 'package':
      return diagram.elements.map((e) => e.id)
  }
}

export {
  type ActivityDiagram,
  type C4Boundary,
  type C4Diagram,
  type C4Element,
  type C4ElementKind,
  type C4Level,
  type C4Relation,
  type ClassDiagram,
  type ClassMember,
  type ClassRelation,
  type ClassRelationKind,
  type ClassVisibility,
  type ComponentDiagram,
  type DeploymentDiagram,
  type ErAttribute,
  type ErCardinality,
  type ErDiagram,
  type ErEntity,
  type ErKey,
  type ErRelation,
  type PackageDiagram,
  parseUmlJson,
  parseUmlValue,
  type SequenceArrow,
  type SequenceBlockKind,
  type SequenceDiagram,
  type SequenceParticipant,
  type SequenceStep,
  type StateDiagram,
  type StateKind,
  type StateTransition,
  toUmlJson,
  type UmlClass,
  type UmlDiagramKind,
  type UmlDirection,
  type UmlLayout,
  type UmlNote,
  type UmlParseResult,
  type UmlPoint,
  type UmlProblem,
  type UmlSpec,
  type UmlState,
  type UseCaseDiagram,
  umlElementIds,
}
