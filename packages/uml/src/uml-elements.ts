import { z } from 'zod'

import type { UmlDirection, UmlLayout, UmlNote } from './uml.ts'

// ── Use case diagram ────────────────────────────────────────────────────────────────────────────

type UseCaseElementKind = 'actor' | 'usecase' | 'system'

interface UseCaseElement {
  id: string
  /** An actor (drawn as a person), a use case (an ellipse), or the system they belong to (a frame). */
  kind: UseCaseElementKind
  label?: string
  /** The system a use case sits in. */
  parent?: string
}

/**
 * `association` joins an actor and a use case; `include` and `extend` go from the use case that
 * includes (or extends) to the other one; `generalization` from the child to the parent.
 */
type UseCaseRelationKind = 'association' | 'include' | 'extend' | 'generalization'

interface UseCaseRelation {
  from: string
  to: string
  /** Default: association. */
  kind?: UseCaseRelationKind
  label?: string
}

interface UseCaseDiagram {
  kind: 'usecase'
  title?: string
  direction?: UmlDirection
  elements: UseCaseElement[]
  relations: UseCaseRelation[]
  notes?: UmlNote[]
  layout?: UmlLayout
}

// ── Activity diagram ────────────────────────────────────────────────────────────────────────────

/** `flowEnd` stops one flow (a circle with a cross); `end` stops the whole activity. */
type ActivityNodeKind =
  | 'action'
  | 'decision'
  | 'merge'
  | 'start'
  | 'end'
  | 'flowEnd'
  | 'fork'
  | 'join'
  | 'partition'

interface ActivityNode {
  id: string
  kind: ActivityNodeKind
  /** What an action does, or the question a decision asks. */
  label?: string
  /** The partition (swimlane) it sits in. */
  parent?: string
}

interface ActivityFlow {
  from: string
  to: string
  /** A guard, shown in brackets: `[paid]`. */
  label?: string
  /** Kept for symmetry with the other kinds: there is one kind of flow. */
  kind?: 'flow'
}

interface ActivityDiagram {
  kind: 'activity'
  title?: string
  direction?: UmlDirection
  elements: ActivityNode[]
  relations: ActivityFlow[]
  notes?: UmlNote[]
  layout?: UmlLayout
}

// ── Deployment diagram ──────────────────────────────────────────────────────────────────────────

/**
 * `node` and `device` are hardware (drawn as boxes in 3D), `environment` an execution environment
 * (a runtime, a container), `artifact` a file that is deployed, `component` a piece of software.
 */
type DeploymentNodeKind =
  | 'node'
  | 'device'
  | 'environment'
  | 'artifact'
  | 'component'
  | 'database'
  | 'cloud'

interface DeploymentNode {
  id: string
  kind: DeploymentNodeKind
  label?: string
  /** Shown in guillemets above the name, instead of the kind: «Kubernetes». */
  stereotype?: string
  /** The node it is deployed on or sits in. */
  parent?: string
}

/** `link` a communication path, `dependency` a dashed arrow, `deploy` an artifact to its target. */
type DeploymentRelationKind = 'link' | 'dependency' | 'deploy'

interface DeploymentRelation {
  from: string
  to: string
  /** Default: link. */
  kind?: DeploymentRelationKind
  /** The protocol on a link: `HTTPS`, `JDBC`. */
  label?: string
}

interface DeploymentDiagram {
  kind: 'deployment'
  title?: string
  direction?: UmlDirection
  elements: DeploymentNode[]
  relations: DeploymentRelation[]
  notes?: UmlNote[]
  layout?: UmlLayout
}

// ── Component diagram ───────────────────────────────────────────────────────────────────────────

/**
 * A `component` (a box, holding others when they name it as `parent`), an `interface` (a small
 * circle, the "lollipop" a component provides), or a `port` (a square on its component's edge).
 */
type ComponentElementKind = 'component' | 'interface' | 'port'

interface ComponentElement {
  id: string
  kind: ComponentElementKind
  label?: string
  /** Shown in guillemets above the name, instead of «component»: «service». */
  stereotype?: string
  /** The component it sits in; a port's is the component whose edge it is on. */
  parent?: string
}

/**
 * `provide` joins a component to the interface it offers (a plain line to the lollipop),
 * `require` to one it needs (a socket around it); `assembly` wires a component that needs
 * something to the one that offers it (a ball in a socket); `delegate` passes a port's work to a
 * part inside; `dependency` is a dashed arrow.
 */
type ComponentRelationKind = 'dependency' | 'provide' | 'require' | 'assembly' | 'delegate'

interface ComponentRelation {
  from: string
  to: string
  /** Default: dependency. */
  kind?: ComponentRelationKind
  label?: string
}

interface ComponentDiagram {
  kind: 'component'
  title?: string
  direction?: UmlDirection
  elements: ComponentElement[]
  relations: ComponentRelation[]
  notes?: UmlNote[]
  layout?: UmlLayout
}

// ── Package diagram ─────────────────────────────────────────────────────────────────────────────

/** A `package` (a folder, holding what names it as `parent`), or an element it contains. */
type PackageElementKind = 'package' | 'class' | 'interface' | 'component'

interface PackageElement {
  id: string
  kind: PackageElementKind
  label?: string
  /** Shown in guillemets above the name: «subsystem». */
  stereotype?: string
  /** The package it is in. */
  parent?: string
}

/**
 * Dashed arrows: `dependency` (uses), `import` (its public names are visible here), `merge`
 * (its contents are added to this package's).
 */
type PackageRelationKind = 'dependency' | 'import' | 'merge'

interface PackageRelation {
  from: string
  to: string
  /** Default: dependency. */
  kind?: PackageRelationKind
  label?: string
}

interface PackageDiagram {
  kind: 'package'
  title?: string
  direction?: UmlDirection
  elements: PackageElement[]
  relations: PackageRelation[]
  notes?: UmlNote[]
  layout?: UmlLayout
}

type ElementDiagram =
  | UseCaseDiagram
  | ActivityDiagram
  | DeploymentDiagram
  | ComponentDiagram
  | PackageDiagram

/** The element kinds of each diagram, in the order a toolbar lists them. */
const USE_CASE_KINDS: readonly UseCaseElementKind[] = ['actor', 'usecase', 'system']
const ACTIVITY_KINDS: readonly ActivityNodeKind[] = [
  'action',
  'decision',
  'merge',
  'start',
  'end',
  'flowEnd',
  'fork',
  'join',
  'partition',
]
const DEPLOYMENT_KINDS: readonly DeploymentNodeKind[] = [
  'node',
  'device',
  'environment',
  'artifact',
  'component',
  'database',
  'cloud',
]
const USE_CASE_RELATIONS: readonly UseCaseRelationKind[] = [
  'association',
  'include',
  'extend',
  'generalization',
]
const DEPLOYMENT_RELATIONS: readonly DeploymentRelationKind[] = ['link', 'dependency', 'deploy']
const COMPONENT_KINDS: readonly ComponentElementKind[] = ['component', 'interface', 'port']
const COMPONENT_RELATIONS: readonly ComponentRelationKind[] = [
  'dependency',
  'provide',
  'require',
  'assembly',
  'delegate',
]
const PACKAGE_KINDS: readonly PackageElementKind[] = ['package', 'class', 'interface', 'component']
const PACKAGE_RELATIONS: readonly PackageRelationKind[] = ['dependency', 'import', 'merge']

/** The element kinds that hold others (drawn as frames), by diagram kind. */
function isContainer(diagram: ElementDiagram, id: string): boolean {
  const element = diagram.elements.find((e) => e.id === id)
  if (!element) return false
  if (element.kind === 'system' || element.kind === 'partition' || element.kind === 'package')
    return true
  const holds = diagram.elements.some((e) => e.parent === id && e.kind !== 'port')
  return (diagram.kind === 'deployment' || diagram.kind === 'component') && holds
}

// ── JSON ────────────────────────────────────────────────────────────────────────────────────────

const id = z.string().min(1)
const text = z.string()
const direction = z.enum(['TB', 'BT', 'LR', 'RL']).optional()
const layout = z.record(z.string(), z.object({ x: z.number(), y: z.number() })).optional()
const notes = z.array(z.object({ text, for: id.optional() })).optional()

const relation = <const K extends readonly [string, ...string[]]>(kinds: K) =>
  z.object({ from: id, to: id, kind: z.enum(kinds).optional(), label: text.optional() })

const usecaseSchema = z.object({
  kind: z.literal('usecase'),
  title: text.optional(),
  direction,
  elements: z.array(
    z.object({
      id,
      kind: z.enum(['actor', 'usecase', 'system']),
      label: text.optional(),
      parent: id.optional(),
    }),
  ),
  relations: z.array(relation(['association', 'include', 'extend', 'generalization'])),
  notes,
  layout,
})

const activitySchema = z.object({
  kind: z.literal('activity'),
  title: text.optional(),
  direction,
  elements: z.array(
    z.object({
      id,
      kind: z.enum([
        'action',
        'decision',
        'merge',
        'start',
        'end',
        'flowEnd',
        'fork',
        'join',
        'partition',
      ]),
      label: text.optional(),
      parent: id.optional(),
    }),
  ),
  relations: z.array(relation(['flow'])),
  notes,
  layout,
})

const deploymentSchema = z.object({
  kind: z.literal('deployment'),
  title: text.optional(),
  direction,
  elements: z.array(
    z.object({
      id,
      kind: z.enum(['node', 'device', 'environment', 'artifact', 'component', 'database', 'cloud']),
      label: text.optional(),
      stereotype: text.optional(),
      parent: id.optional(),
    }),
  ),
  relations: z.array(relation(['link', 'dependency', 'deploy'])),
  notes,
  layout,
})

const componentSchema = z.object({
  kind: z.literal('component'),
  title: text.optional(),
  direction,
  elements: z.array(
    z.object({
      id,
      kind: z.enum(['component', 'interface', 'port']),
      label: text.optional(),
      stereotype: text.optional(),
      parent: id.optional(),
    }),
  ),
  relations: z.array(relation(['dependency', 'provide', 'require', 'assembly', 'delegate'])),
  notes,
  layout,
})

const packageSchema = z.object({
  kind: z.literal('package'),
  title: text.optional(),
  direction,
  elements: z.array(
    z.object({
      id,
      kind: z.enum(['package', 'class', 'interface', 'component']),
      label: text.optional(),
      stereotype: text.optional(),
      parent: id.optional(),
    }),
  ),
  relations: z.array(relation(['dependency', 'import', 'merge'])),
  notes,
  layout,
})

export {
  ACTIVITY_KINDS,
  type ActivityDiagram,
  type ActivityFlow,
  type ActivityNode,
  type ActivityNodeKind,
  activitySchema,
  COMPONENT_KINDS,
  COMPONENT_RELATIONS,
  type ComponentDiagram,
  type ComponentElement,
  type ComponentElementKind,
  type ComponentRelation,
  type ComponentRelationKind,
  componentSchema,
  DEPLOYMENT_KINDS,
  DEPLOYMENT_RELATIONS,
  type DeploymentDiagram,
  type DeploymentNode,
  type DeploymentNodeKind,
  type DeploymentRelation,
  type DeploymentRelationKind,
  deploymentSchema,
  direction,
  type ElementDiagram,
  id,
  isContainer,
  layout,
  notes,
  PACKAGE_KINDS,
  PACKAGE_RELATIONS,
  type PackageDiagram,
  type PackageElement,
  type PackageElementKind,
  type PackageRelation,
  type PackageRelationKind,
  packageSchema,
  text,
  USE_CASE_KINDS,
  USE_CASE_RELATIONS,
  type UseCaseDiagram,
  type UseCaseElement,
  type UseCaseElementKind,
  type UseCaseRelation,
  type UseCaseRelationKind,
  usecaseSchema,
}
