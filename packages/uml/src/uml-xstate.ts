// A state diagram as an XState v5 machine config: plain JSON that `createMachine(config)` accepts.
// Guards and actions are referenced by name; the caller implements them with
// `setup({ guards, actions })`. Every node has an explicit `id` and every target is `#id`, so
// targets resolve across the hierarchy. Same diagram, same config: nothing depends on time or order
// other than the diagram's own.
import type { StateDiagram, StateTransition, UmlState } from './uml.ts'

/** Why a diagram can't be exported (errors) or is exported with a guess (warnings). */
const XSTATE_PROBLEM_CODES = {
  /** The diagram has no state. */
  noStates: 'no-states',
  /** A transition or a `parent` names a state the diagram does not declare. */
  unknownState: 'unknown-state',
  /** A `[*]` start that isn't a state of its scope, or a `[*]` end from outside its scope. */
  misplacedPseudostate: 'misplaced-pseudostate',
  /** A scope with states but no `[*]` start: its first state was taken. */
  missingInitial: 'missing-initial',
  /** A scope with more than one `[*]` start: only the first was kept. */
  multipleInitial: 'multiple-initial',
  /** A label on a transition that can't carry one (a `[*]` start, a fork's branch): dropped. */
  ignoredLabel: 'ignored-label',
  /** A fork whose branches don't all end in the same join. */
  forkWithoutJoin: 'fork-without-join',
  /** Two branches of a fork reach the same state. */
  forkBranchesShare: 'fork-branches-share',
  /** A branch of a fork leaves (or is entered) other than through the fork and its join. */
  forkBranchEscapes: 'fork-branch-escapes',
  /** A join no fork leads to, or entered from outside its fork's branches. */
  joinWithoutFork: 'join-without-fork',
} as const

type XStateProblemCode = (typeof XSTATE_PROBLEM_CODES)[keyof typeof XSTATE_PROBLEM_CODES]

interface XStateProblem {
  code: XStateProblemCode
  severity: 'error' | 'warning'
  /** The diagram's state ids it is about. */
  states?: string[]
}

interface XStateTransition {
  target: string
  guard?: string
  actions?: string[]
}

/** One transition, or several tried in diagram order. */
type XStateTransitions = XStateTransition | XStateTransition[]

interface XStateNode {
  id: string
  type?: 'parallel' | 'final'
  description?: string
  /** The diagram's state id, when the node's key and id had to differ from it. */
  meta?: { umlId: string }
  initial?: string
  states?: Record<string, XStateNode>
  on?: Record<string, XStateTransitions>
  always?: XStateTransitions
  onDone?: XStateTransitions
}

type XStateConfig = XStateNode

interface XStateExport {
  /** Null when the diagram cannot be exported (see the error problems). */
  config: XStateConfig | null
  problems: XStateProblem[]
  /** Every event name, sorted and unique; so are guards and actions. */
  events: string[]
  guards: string[]
  actions: string[]
}

/** The machine's own id. Generated names contain `$`, which a state's key never does. */
const ROOT_ID = '$root'
/** The key of the generated final state of a scope. */
const FINAL_KEY = '$final'
const START = '[*]'

const regionKey = (index: number) => `$region${index}`
const regionId = (ownerId: string, index: number) => `${ownerId}${regionKey(index)}`
const finalId = (scopeId: string) => `${scopeId}${FINAL_KEY}`

/** `event [guard] / action1, action2`, every part optional. */
function parseLabel(label: string | undefined): {
  event?: string
  guard?: string
  actions: string[]
} {
  const text = label?.trim() ?? ''
  const close = text.lastIndexOf(']')
  const slash = text.indexOf('/', close + 1)
  const head = slash < 0 ? text : text.slice(0, slash)
  const actions =
    slash < 0
      ? []
      : text
          .slice(slash + 1)
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean)
  const m = /^(.*?)\s*(?:\[(.*)\])?\s*$/s.exec(head)
  const event = m?.[1]?.trim()
  const guard = m?.[2]?.trim()
  return { ...(event ? { event } : {}), ...(guard ? { guard } : {}), actions }
}

/**
 * Keys without dots (XState reads a dot as a path), unique: ids without a dot keep their name, a
 * dotted id gets `_` for each dot, and a number if that name is taken.
 */
function stateKeys(states: readonly UmlState[]): Map<string, string> {
  const keys = new Map<string, string>()
  const taken = new Set<string>()
  for (const s of states) {
    if (s.id.includes('.')) continue
    keys.set(s.id, s.id)
    taken.add(s.id)
  }
  for (const s of states) {
    if (!s.id.includes('.')) continue
    const base = s.id.replaceAll('.', '_')
    let key = base
    for (let n = 2; taken.has(key); n++) key = `${base}_${n}`
    keys.set(s.id, key)
    taken.add(key)
  }
  return keys
}

interface ForkMatch {
  join: string
  /** The states each branch holds directly, in the order they are reached. */
  branches: string[][]
  /** Every state the branches hold, nested forks' states and joins included. */
  held: string[]
}

/** The whole conversion; one per call. */
class Exporter {
  readonly problems: XStateProblem[] = []
  readonly events = new Set<string>()
  readonly guards = new Set<string>()
  readonly actions = new Set<string>()
  readonly byId: Map<string, UmlState>
  readonly keys: Map<string, string>
  readonly forks = new Map<string, ForkMatch | null>()
  /** Fork → the joins it matched; join → its fork. */
  readonly joinFork = new Map<string, string>()
  /** A state a fork's branch holds (directly, or inside a nested fork) → the region's id. */
  readonly branchRegion = new Map<string, string>()
  /** The scope (container id) each state sits in once forks are rebuilt. */
  readonly container = new Map<string, string>()
  readonly finals = new Set<string>()
  readonly initials = new Map<string, string>()
  readonly diagram: StateDiagram

  constructor(diagram: StateDiagram) {
    this.diagram = diagram
    this.byId = new Map(diagram.states.map((s) => [s.id, s]))
    this.keys = stateKeys(diagram.states)
  }

  problem(code: XStateProblemCode, severity: 'error' | 'warning', states?: string[]) {
    this.problems.push({ code, severity, ...(states?.length ? { states } : {}) })
  }

  get failed() {
    return this.problems.some((p) => p.severity === 'error')
  }

  key(id: string): string {
    return this.keys.get(id) ?? id
  }

  children(parent: string | undefined): UmlState[] {
    return this.diagram.states.filter((s) => s.parent === parent)
  }

  /** The regions a composite's states name, ascending. More than one: it runs them in parallel. */
  regions(id: string): number[] {
    return [...new Set(this.children(id).map((s) => s.region ?? 0))].sort((a, b) => a - b)
  }

  isParallel(id: string): boolean {
    return this.regions(id).length > 1
  }

  /** The scope a state sits in before forks are rebuilt: the root, its composite, or a region. */
  base(s: UmlState): string {
    if (!s.parent) return ROOT_ID
    const parent = this.key(s.parent)
    return this.isParallel(s.parent) ? regionId(parent, s.region ?? 0) : parent
  }

  /** The ancestor of `id` (or `id` itself) whose parent is `parent`; undefined if none. */
  ancestorIn(id: string, parent: string | undefined): UmlState | undefined {
    for (let s = this.byId.get(id); s; s = s.parent ? this.byId.get(s.parent) : undefined) {
      if (s.parent === parent) return s
    }
    return undefined
  }

  /** The ancestor of `id` (or `id` itself) that sits in the scope `home`; undefined if none. */
  ownerIn(home: string, id: string): UmlState | undefined {
    for (let s = this.byId.get(id); s; s = s.parent ? this.byId.get(s.parent) : undefined) {
      if (this.base(s) === home) return s
    }
    return undefined
  }

  isInside(id: string, ancestor: string): boolean {
    for (let s = this.byId.get(id); s; s = s.parent ? this.byId.get(s.parent) : undefined) {
      if (s.id === ancestor) return true
    }
    return false
  }

  kind(id: string) {
    return this.byId.get(id)?.kind ?? 'state'
  }

  checkIds(): void {
    const unknown = new Set<string>()
    const known = (id: string | undefined) => {
      if (id !== undefined && id !== START && !this.byId.has(id)) unknown.add(id)
    }
    for (const s of this.diagram.states) known(s.parent)
    for (const t of this.diagram.transitions) {
      known(t.from)
      known(t.to)
      known(t.parent)
    }
    if (unknown.size) this.problem(XSTATE_PROBLEM_CODES.unknownState, 'error', [...unknown].sort())
  }

  // ── Forks and joins ───────────────────────────────────────────────────────────────────────────

  /**
   * The join a fork's branches end in, and the states of each branch: every state reachable from
   * a branch's first state without crossing the join. Null (with an error) when the branches
   * don't make a parallel state.
   */
  matchFork(fork: UmlState, inProgress: Set<string>): ForkMatch | null {
    if (this.forks.has(fork.id)) return this.forks.get(fork.id) ?? null
    const fail = (code: XStateProblemCode, states: string[]) => {
      this.problem(code, 'error', states)
      this.forks.set(fork.id, null)
      return null
    }
    inProgress.add(fork.id)
    const home = this.base(fork)
    const out = this.diagram.transitions.filter((t) => t.from === fork.id)
    if (!out.length) return fail(XSTATE_PROBLEM_CODES.forkWithoutJoin, [fork.id])
    const joins = new Set<string>()
    const branches: string[][] = []
    /** Every state a branch holds, nested forks' states and joins included. */
    const held: Set<string>[] = []
    const holder = new Map<string, number>()
    for (const [index, start] of out.entries()) {
      if (start.label) this.problem(XSTATE_PROBLEM_CODES.ignoredLabel, 'warning', [fork.id])
      if (start.to === START) return fail(XSTATE_PROBLEM_CODES.forkBranchEscapes, [fork.id])
      const branch: string[] = []
      const all = new Set<string>()
      const queue = [start.to]
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        if (all.has(id) || id === fork.id) continue
        const s = this.byId.get(id)
        if (!s) continue
        if (s.kind === 'join') {
          joins.add(id)
          this.finals.add(regionId(this.key(fork.id), index))
          continue
        }
        if (this.base(s) !== home)
          return fail(XSTATE_PROBLEM_CODES.forkBranchEscapes, [fork.id, id])
        const other = holder.get(id)
        if (other !== undefined) return fail(XSTATE_PROBLEM_CODES.forkBranchesShare, [fork.id, id])
        branch.push(id)
        all.add(id)
        holder.set(id, index)
        let next: StateTransition[]
        if (s.kind === 'fork') {
          if (inProgress.has(id)) return fail(XSTATE_PROBLEM_CODES.forkWithoutJoin, [fork.id, id])
          const nested = this.matchFork(s, inProgress)
          if (!nested) {
            this.forks.set(fork.id, null)
            return null
          }
          for (const inner of [...nested.held, nested.join]) {
            if (holder.has(inner))
              return fail(XSTATE_PROBLEM_CODES.forkBranchesShare, [fork.id, inner])
            all.add(inner)
            holder.set(inner, index)
          }
          next = this.diagram.transitions.filter((t) => t.from === nested.join)
        } else {
          // Transitions out of the state, or out of a state inside it to somewhere outside it.
          next = this.diagram.transitions.filter(
            (t) =>
              t.from !== START &&
              (t.from === id || this.isInside(t.from, id)) &&
              !(t.to === START ? t.parent && this.isInside(t.parent, id) : this.isInside(t.to, id)),
          )
        }
        for (const t of next) {
          if (t.to === START) return fail(XSTATE_PROBLEM_CODES.forkBranchEscapes, [fork.id, id])
          const target = this.kind(t.to) === 'join' ? t.to : this.ownerIn(home, t.to)?.id
          if (!target) return fail(XSTATE_PROBLEM_CODES.forkBranchEscapes, [fork.id, t.to])
          queue.push(target)
        }
      }
      branches.push(branch)
      held.push(all)
    }
    const joinState = joins.size === 1 ? this.byId.get([...joins][0] ?? '') : undefined
    if (!joinState || this.base(joinState) !== home)
      return fail(XSTATE_PROBLEM_CODES.forkWithoutJoin, [fork.id, ...[...joins].sort()])
    const join = joinState.id
    // A branch is entered only through the fork, and the join only from the branches.
    for (const t of this.diagram.transitions) {
      const index = holder.get(t.to)
      const isJoin = t.to === join
      if (index === undefined && !isJoin) continue
      if (t.from === START)
        return fail(
          isJoin ? XSTATE_PROBLEM_CODES.joinWithoutFork : XSTATE_PROBLEM_CODES.forkBranchEscapes,
          [fork.id, t.to],
        )
      const owner = this.kind(t.from) === 'join' ? t.from : this.ownerIn(home, t.from)?.id
      const fromIndex = owner === undefined ? undefined : holder.get(owner)
      if (isJoin) {
        if (fromIndex === undefined && owner !== fork.id)
          return fail(XSTATE_PROBLEM_CODES.joinWithoutFork, [join, t.from])
      } else if (owner !== fork.id && owner !== join && fromIndex !== index) {
        return fail(XSTATE_PROBLEM_CODES.forkBranchEscapes, [fork.id, t.to])
      }
    }
    const forkKey = this.key(fork.id)
    for (const [index, all] of held.entries()) {
      // A nested fork already placed its own states in its regions.
      for (const id of all)
        if (!this.branchRegion.has(id)) this.branchRegion.set(id, regionId(forkKey, index))
    }
    for (const [index, branch] of branches.entries()) {
      for (const id of branch) this.container.set(id, regionId(forkKey, index))
    }
    this.joinFork.set(join, fork.id)
    const match = { join, branches, held: held.flatMap((all) => [...all]) }
    this.forks.set(fork.id, match)
    inProgress.delete(fork.id)
    return match
  }

  matchForks(): void {
    for (const s of this.diagram.states) {
      if (s.kind === 'fork') this.matchFork(s, new Set())
    }
    if (this.failed) return
    for (const s of this.diagram.states) {
      if (s.kind === 'join' && !this.joinFork.has(s.id))
        this.problem(XSTATE_PROBLEM_CODES.joinWithoutFork, 'error', [s.id])
    }
  }

  // ── Starts and ends ───────────────────────────────────────────────────────────────────────────

  /** The scope a `[*]` end of `t` closes: the region of the state it comes from. */
  endScope(t: StateTransition): string | undefined {
    if (t.from === START) return undefined
    const owner = this.ancestorIn(t.from, t.parent)
    return owner ? this.base(owner) : undefined
  }

  readPseudostates(): void {
    for (const t of this.diagram.transitions) {
      if (t.from === START) {
        if (t.label) this.problem(XSTATE_PROBLEM_CODES.ignoredLabel, 'warning', [t.to])
        const s = this.byId.get(t.to)
        if (!s || s.parent !== t.parent || s.kind === 'join') {
          this.problem(XSTATE_PROBLEM_CODES.misplacedPseudostate, 'error', [t.to])
          continue
        }
        const scope = this.base(s)
        if (this.initials.has(scope))
          this.problem(XSTATE_PROBLEM_CODES.multipleInitial, 'warning', [t.to])
        else this.initials.set(scope, this.key(s.id))
      } else if (t.to === START) {
        const scope = this.endScope(t)
        if (scope === undefined)
          this.problem(XSTATE_PROBLEM_CODES.misplacedPseudostate, 'error', [t.from])
        else this.finals.add(scope)
      }
    }
  }

  // ── Transitions ───────────────────────────────────────────────────────────────────────────────

  target(t: StateTransition): string {
    if (t.to === START) return `#${finalId(this.endScope(t) ?? ROOT_ID)}`
    if (this.kind(t.to) === 'join') {
      const fork = this.joinFork.get(t.to) ?? ''
      const home = this.base(this.byId.get(fork) as UmlState)
      const owner = this.kind(t.from) === 'join' ? t.from : (this.ownerIn(home, t.from)?.id ?? '')
      return `#${finalId(this.branchRegion.get(owner) ?? '')}`
    }
    return `#${this.key(t.to)}`
  }

  transition(t: StateTransition, guard: string | undefined, actions: string[]): XStateTransition {
    if (guard) this.guards.add(guard)
    for (const a of actions) this.actions.add(a)
    return {
      target: this.target(t),
      ...(guard ? { guard } : {}),
      ...(actions.length ? { actions } : {}),
    }
  }

  /**
   * Whether an eventless transition out of `id` waits for it to complete (`onDone`): a fork or any
   * composite. A composite with no `[*]` end never completes, so that transition never fires.
   */
  completes(id: string): boolean {
    return this.kind(id) === 'fork' || this.children(id).length > 0
  }

  /** The transitions leaving each node, by the node's diagram id (a join's go to its fork). */
  transitionsBySource(): Map<string, Pick<XStateNode, 'on' | 'always' | 'onDone'>> {
    const lists = new Map<
      string,
      {
        on: Map<string, XStateTransition[]>
        always: XStateTransition[]
        onDone: XStateTransition[]
      }
    >()
    const listOf = (id: string) => {
      let list = lists.get(id)
      if (!list) {
        list = { on: new Map(), always: [], onDone: [] }
        lists.set(id, list)
      }
      return list
    }
    const choiceElse = new Map<string, XStateTransition[]>()
    for (const t of this.diagram.transitions) {
      if (t.from === START || this.kind(t.from) === 'fork') continue
      const label = parseLabel(t.label)
      if (this.kind(t.from) === 'join') {
        const fork = this.joinFork.get(t.from) ?? ''
        listOf(fork).onDone.push(this.transition(t, label.guard, label.actions))
      } else if (this.kind(t.from) === 'choice') {
        const name = label.guard ?? label.event
        const guard = name === 'else' ? undefined : name
        const out = this.transition(t, guard, label.actions)
        if (guard) listOf(t.from).always.push(out)
        else choiceElse.set(t.from, [...(choiceElse.get(t.from) ?? []), out])
      } else if (label.event) {
        this.events.add(label.event)
        const on = listOf(t.from).on
        on.set(label.event, [
          ...(on.get(label.event) ?? []),
          this.transition(t, label.guard, label.actions),
        ])
      } else {
        const list = listOf(t.from)
        ;(this.completes(t.from) ? list.onDone : list.always).push(
          this.transition(t, label.guard, label.actions),
        )
      }
    }
    for (const [id, rest] of choiceElse) listOf(id).always.push(...rest)
    const one = (list: XStateTransition[]): XStateTransitions =>
      list.length === 1 ? (list[0] as XStateTransition) : list
    const out = new Map<string, Pick<XStateNode, 'on' | 'always' | 'onDone'>>()
    for (const [id, list] of lists) {
      out.set(id, {
        ...(list.on.size
          ? { on: Object.fromEntries([...list.on].map(([event, ts]) => [event, one(ts)])) }
          : {}),
        ...(list.always.length ? { always: one(list.always) } : {}),
        ...(list.onDone.length ? { onDone: one(list.onDone) } : {}),
      })
    }
    return out
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────────────────────────

  /** A scope's `initial` and `states`: its own states, then its final state if anything ends it. */
  scope(
    id: string,
    states: UmlState[],
    edges: Map<string, Pick<XStateNode, 'on' | 'always' | 'onDone'>>,
    initial?: string,
  ): Pick<XStateNode, 'initial' | 'states'> {
    let first = initial ?? this.initials.get(id)
    if (!first) {
      first = states[0] ? this.key(states[0].id) : FINAL_KEY
      if (states[0]) this.problem(XSTATE_PROBLEM_CODES.missingInitial, 'warning', [states[0].id])
    }
    const nodes: Record<string, XStateNode> = {}
    for (const s of states) nodes[this.key(s.id)] = this.node(s, edges)
    if (this.finals.has(id) || first === FINAL_KEY)
      nodes[FINAL_KEY] = { id: finalId(id), type: 'final' }
    return { initial: first, states: nodes }
  }

  /** The states sitting in a scope once forks are rebuilt, in diagram order (joins vanish). */
  statesIn(scope: string): UmlState[] {
    return this.diagram.states.filter(
      (s) => s.kind !== 'join' && (this.container.get(s.id) ?? this.base(s)) === scope,
    )
  }

  node(s: UmlState, edges: Map<string, Pick<XStateNode, 'on' | 'always' | 'onDone'>>): XStateNode {
    const key = this.key(s.id)
    const node: XStateNode = { id: key }
    const fork = s.kind === 'fork' ? this.forks.get(s.id) : undefined
    if (fork || this.isParallel(s.id)) node.type = 'parallel'
    if (s.description) node.description = s.description
    if (key !== s.id) node.meta = { umlId: s.id }
    if (fork) {
      node.states = {}
      for (const [index, branch] of fork.branches.entries()) {
        const id = regionId(key, index)
        node.states[regionKey(index)] = {
          id,
          ...this.scope(id, this.statesIn(id), edges, branch[0] ? this.key(branch[0]) : FINAL_KEY),
        }
      }
    } else if (this.isParallel(s.id)) {
      node.states = {}
      for (const r of this.regions(s.id)) {
        const id = regionId(key, r)
        node.states[regionKey(r)] = { id, ...this.scope(id, this.statesIn(id), edges) }
      }
    } else if (this.children(s.id).length) {
      Object.assign(node, this.scope(key, this.statesIn(key), edges))
    }
    Object.assign(node, edges.get(s.id))
    return node
  }

  run(): XStateConfig | null {
    if (!this.diagram.states.length) {
      this.problem(XSTATE_PROBLEM_CODES.noStates, 'error')
      return null
    }
    this.checkIds()
    if (this.failed) return null
    this.matchForks()
    if (this.failed) return null
    this.readPseudostates()
    if (this.failed) return null
    const edges = this.transitionsBySource()
    const title = this.diagram.title
    return {
      id: ROOT_ID,
      ...(title ? { description: title } : {}),
      ...this.scope(ROOT_ID, this.statesIn(ROOT_ID), edges),
    }
  }
}

/** The diagram as an XState v5 machine config, with what had to be refused or guessed. */
function stateToXState(diagram: StateDiagram): XStateExport {
  const exporter = new Exporter(diagram)
  const config = exporter.run()
  const sorted = (names: Set<string>) => (config ? [...names].sort() : [])
  return {
    config,
    problems: exporter.problems,
    events: sorted(exporter.events),
    guards: sorted(exporter.guards),
    actions: sorted(exporter.actions),
  }
}

export {
  stateToXState,
  XSTATE_PROBLEM_CODES,
  type XStateConfig,
  type XStateExport,
  type XStateNode,
  type XStateProblem,
  type XStateProblemCode,
  type XStateTransition,
  type XStateTransitions,
}
