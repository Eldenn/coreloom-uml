import { describe, expect, it } from 'vitest'

import { parseDiagramText } from './index.ts'
import type { StateDiagram } from './uml.ts'
import { stateToXState, XSTATE_PROBLEM_CODES } from './uml-xstate.ts'

function read(text: string): StateDiagram {
  const { diagram, problems } = parseDiagramText(`stateDiagram-v2\n${text}`, 'mermaid')
  expect(problems).toEqual([])
  if (diagram?.kind !== 'state') throw new Error('not a state diagram')
  return diagram
}

const exported = (text: string) => stateToXState(read(text))

describe('stateToXState', () => {
  it('maps events, guards, actions, the start and the end of the diagram', () => {
    const out = exported(`
      [*] --> Idle
      Idle --> Running : start
      Running --> Idle : stop [canStop] / log, reset
      Running --> [*] : finish
      Idle : Waiting for work`)
    expect(out.problems).toEqual([])
    expect(out.config).toEqual({
      id: '$root',
      initial: 'Idle',
      states: {
        Idle: {
          id: 'Idle',
          description: 'Waiting for work',
          on: { start: { target: '#Running' } },
        },
        Running: {
          id: 'Running',
          on: {
            stop: { target: '#Idle', guard: 'canStop', actions: ['log', 'reset'] },
            finish: { target: '#$root$final' },
          },
        },
        $final: { id: '$root$final', type: 'final' },
      },
    })
    expect(out.events).toEqual(['finish', 'start', 'stop'])
    expect(out.guards).toEqual(['canStop'])
    expect(out.actions).toEqual(['log', 'reset'])
  })

  it('keeps several transitions on one event in order, and makes eventless ones `always`', () => {
    const out = exported(`
      [*] --> A
      A --> B : go [ready]
      A --> C : go
      B --> C : [done] / tidy
      C --> A`)
    const states = out.config?.states ?? {}
    expect(states.A?.on).toEqual({
      go: [{ target: '#B', guard: 'ready' }, { target: '#C' }],
    })
    expect(states.B?.always).toEqual({ target: '#C', guard: 'done', actions: ['tidy'] })
    expect(states.C?.always).toEqual({ target: '#A' })
  })

  it('nests composite states, with their own start and end, and completes them with onDone', () => {
    const out = exported(`
      [*] --> Busy
      state Busy {
        [*] --> Load
        Load --> Save : loaded
        Save --> [*]
      }
      Busy --> Done
      Busy --> Done : cancel`)
    expect(out.problems).toEqual([])
    expect(out.config?.states?.Busy).toEqual({
      id: 'Busy',
      initial: 'Load',
      states: {
        Load: { id: 'Load', on: { loaded: { target: '#Save' } } },
        Save: { id: 'Save', always: { target: '#Busy$final' } },
        $final: { id: 'Busy$final', type: 'final' },
      },
      on: { cancel: { target: '#Done' } },
      onDone: { target: '#Done' },
    })
  })

  it('waits for a composite without an end to complete, which it never does', () => {
    const out = exported(`
      [*] --> Box
      state Box {
        [*] --> In
      }
      Box --> Next`)
    expect(out.config?.states?.Box?.always).toBeUndefined()
    expect(out.config?.states?.Box?.onDone).toEqual({ target: '#Next' })
  })

  it('takes the first state of a scope without a start, with a warning', () => {
    const out = exported(`
      state Outer {
        First --> Second : next
      }`)
    expect(out.config?.initial).toBe('Outer')
    expect(out.config?.states?.Outer?.initial).toBe('First')
    expect(out.problems).toEqual([
      { code: XSTATE_PROBLEM_CODES.missingInitial, severity: 'warning', states: ['Outer'] },
      { code: XSTATE_PROBLEM_CODES.missingInitial, severity: 'warning', states: ['First'] },
    ])
  })

  it('turns dots into underscores in keys and ids, without collisions, and keeps the name', () => {
    const out = exported(`
      [*] --> a.b
      a.b --> a_b : go
      a_b --> a.b : back`)
    expect(out.config).toEqual({
      id: '$root',
      initial: 'a_b_2',
      states: {
        a_b_2: { id: 'a_b_2', meta: { umlId: 'a.b' }, on: { go: { target: '#a_b' } } },
        a_b: { id: 'a_b', on: { back: { target: '#a_b_2' } } },
      },
    })
  })

  it('makes a choice a state of guarded `always` transitions, the unguarded one last', () => {
    const out = exported(`
      [*] --> Check
      state Check <<choice>>
      Check --> Low
      Check --> High : [isHigh]
      Check --> Mid : isMid / note`)
    expect(out.config?.states?.Check).toEqual({
      id: 'Check',
      always: [
        { target: '#High', guard: 'isHigh' },
        { target: '#Mid', guard: 'isMid', actions: ['note'] },
        { target: '#Low' },
      ],
    })
    expect(out.guards).toEqual(['isHigh', 'isMid'])
    expect(out.events).toEqual([])
  })

  it('reads `else` on a choice as no guard', () => {
    const out = exported(`
      [*] --> C
      state C <<choice>>
      C --> B : else
      C --> A : [ok]`)
    expect(out.config?.states?.C?.always).toEqual([{ target: '#A', guard: 'ok' }, { target: '#B' }])
  })

  it('runs explicit regions in parallel, each with its own start and end', () => {
    const diagram: StateDiagram = {
      kind: 'state',
      states: [
        { id: 'Active' },
        { id: 'Play', parent: 'Active' },
        { id: 'Pause', parent: 'Active' },
        { id: 'Muted', parent: 'Active', region: 1 },
        { id: 'Loud', parent: 'Active', region: 1 },
        { id: 'Off' },
      ],
      transitions: [
        { from: '[*]', to: 'Active' },
        { from: '[*]', to: 'Play', parent: 'Active' },
        { from: 'Play', to: 'Pause', label: 'pause' },
        { from: 'Pause', to: '[*]', parent: 'Active', label: 'stop' },
        { from: '[*]', to: 'Loud', parent: 'Active' },
        { from: 'Loud', to: 'Muted', label: 'mute' },
        { from: 'Muted', to: '[*]', parent: 'Active' },
        { from: 'Active', to: 'Off' },
      ],
    }
    const out = stateToXState(diagram)
    expect(out.problems).toEqual([])
    expect(out.config?.states?.Active).toEqual({
      id: 'Active',
      type: 'parallel',
      states: {
        $region0: {
          id: 'Active$region0',
          initial: 'Play',
          states: {
            Play: { id: 'Play', on: { pause: { target: '#Pause' } } },
            Pause: { id: 'Pause', on: { stop: { target: '#Active$region0$final' } } },
            $final: { id: 'Active$region0$final', type: 'final' },
          },
        },
        $region1: {
          id: 'Active$region1',
          initial: 'Loud',
          states: {
            Muted: { id: 'Muted', always: { target: '#Active$region1$final' } },
            Loud: { id: 'Loud', on: { mute: { target: '#Muted' } } },
            $final: { id: 'Active$region1$final', type: 'final' },
          },
        },
      },
      onDone: { target: '#Off' },
    })
  })

  it('rebuilds a parallel state from a fork and its join', () => {
    const out = exported(`
      [*] --> Start
      state Split <<fork>>
      state Merge <<join>>
      Start --> Split : begin
      Split --> Pay
      Split --> Pack
      Pay --> Paid : charge
      Paid --> Merge
      Pack --> Merge : packed / label
      Merge --> Ship`)
    expect(out.problems).toEqual([])
    expect(out.config).toEqual({
      id: '$root',
      initial: 'Start',
      states: {
        Start: { id: 'Start', on: { begin: { target: '#Split' } } },
        Split: {
          id: 'Split',
          type: 'parallel',
          states: {
            $region0: {
              id: 'Split$region0',
              initial: 'Pay',
              states: {
                Pay: { id: 'Pay', on: { charge: { target: '#Paid' } } },
                Paid: { id: 'Paid', always: { target: '#Split$region0$final' } },
                $final: { id: 'Split$region0$final', type: 'final' },
              },
            },
            $region1: {
              id: 'Split$region1',
              initial: 'Pack',
              states: {
                Pack: {
                  id: 'Pack',
                  on: { packed: { target: '#Split$region1$final', actions: ['label'] } },
                },
                $final: { id: 'Split$region1$final', type: 'final' },
              },
            },
          },
          onDone: { target: '#Ship' },
        },
        Ship: { id: 'Ship' },
      },
    })
  })

  it('nests a fork inside a branch of another fork', () => {
    const out = exported(`
      [*] --> F1
      state F1 <<fork>>
      state J1 <<join>>
      state F2 <<fork>>
      state J2 <<join>>
      F1 --> A
      F1 --> F2
      F2 --> B
      F2 --> J2
      B --> J2 : done
      J2 --> C
      A --> J1
      C --> J1
      J1 --> [*]`)
    expect(out.problems).toEqual([])
    const f1 = out.config?.states?.F1
    expect(out.config?.initial).toBe('F1')
    expect(f1?.onDone).toEqual({ target: '#$root$final' })
    expect(f1?.states?.$region1).toEqual({
      id: 'F1$region1',
      initial: 'F2',
      states: {
        F2: {
          id: 'F2',
          type: 'parallel',
          states: {
            $region0: {
              id: 'F2$region0',
              initial: 'B',
              states: {
                B: { id: 'B', on: { done: { target: '#F2$region0$final' } } },
                $final: { id: 'F2$region0$final', type: 'final' },
              },
            },
            $region1: {
              id: 'F2$region1',
              initial: '$final',
              states: { $final: { id: 'F2$region1$final', type: 'final' } },
            },
          },
          onDone: { target: '#C' },
        },
        C: { id: 'C', always: { target: '#F1$region1$final' } },
        $final: { id: 'F1$region1$final', type: 'final' },
      },
    })
    expect(f1?.states?.$region0?.states?.A).toEqual({
      id: 'A',
      always: { target: '#F1$region0$final' },
    })
  })

  describe('refuses', () => {
    const refused = (text: string) => {
      const out = exported(text)
      expect(out.config).toBeNull()
      expect(out.events).toEqual([])
      return out.problems.filter((p) => p.severity === 'error')
    }

    it('a fork without a join', () => {
      expect(
        refused(`
          [*] --> F
          state F <<fork>>
          F --> A
          F --> B`),
      ).toEqual([{ code: XSTATE_PROBLEM_CODES.forkWithoutJoin, severity: 'error', states: ['F'] }])
    })

    it('a fork whose branches end in different joins', () => {
      expect(
        refused(`
          [*] --> F
          state F <<fork>>
          state J1 <<join>>
          state J2 <<join>>
          F --> A
          F --> B
          A --> J1
          B --> J2`),
      ).toEqual([
        {
          code: XSTATE_PROBLEM_CODES.forkWithoutJoin,
          severity: 'error',
          states: ['F', 'J1', 'J2'],
        },
      ])
    })

    it('two branches sharing a state', () => {
      expect(
        refused(`
          [*] --> F
          state F <<fork>>
          state J <<join>>
          F --> A
          F --> B
          A --> S
          B --> S
          S --> J`),
      ).toEqual([
        { code: XSTATE_PROBLEM_CODES.forkBranchesShare, severity: 'error', states: ['F', 'S'] },
      ])
    })

    it('a branch that ends the diagram instead of reaching the join', () => {
      expect(
        refused(`
          [*] --> F
          state F <<fork>>
          state J <<join>>
          F --> A
          F --> B
          A --> J
          B --> [*]`),
      ).toEqual([
        { code: XSTATE_PROBLEM_CODES.forkBranchEscapes, severity: 'error', states: ['F', 'B'] },
      ])
    })

    it('a branch that goes back to a state before the fork', () => {
      expect(
        refused(`
          [*] --> Before
          state F <<fork>>
          state J <<join>>
          Before --> F
          F --> A
          F --> B
          A --> J
          B --> Before`),
      ).toEqual([
        {
          code: XSTATE_PROBLEM_CODES.forkBranchEscapes,
          severity: 'error',
          states: ['F', 'Before'],
        },
      ])
    })

    it('a branch that leaves the fork’s composite', () => {
      expect(
        refused(`
          [*] --> Box
          state Box {
            state F <<fork>>
            state J <<join>>
            [*] --> F
            F --> A
            F --> B
            A --> J
          }
          B --> Out`),
      ).toEqual([
        { code: XSTATE_PROBLEM_CODES.forkBranchEscapes, severity: 'error', states: ['F', 'Out'] },
      ])
    })

    it('a join no fork leads to', () => {
      expect(
        refused(`
          [*] --> A
          state J <<join>>
          A --> J
          J --> B`),
      ).toEqual([{ code: XSTATE_PROBLEM_CODES.joinWithoutFork, severity: 'error', states: ['J'] }])
    })

    it('a transition to a state the diagram does not declare', () => {
      const out = stateToXState({
        kind: 'state',
        states: [{ id: 'A' }],
        transitions: [{ from: 'A', to: 'Ghost' }],
      })
      expect(out.config).toBeNull()
      expect(out.problems).toEqual([
        { code: XSTATE_PROBLEM_CODES.unknownState, severity: 'error', states: ['Ghost'] },
      ])
    })

    it('an empty diagram', () => {
      expect(stateToXState({ kind: 'state', states: [], transitions: [] }).problems).toEqual([
        { code: XSTATE_PROBLEM_CODES.noStates, severity: 'error' },
      ])
    })
  })

  it('gives the same bytes for the same diagram', () => {
    const text = `
      [*] --> F
      state F <<fork>>
      state J <<join>>
      F --> A
      F --> B
      A --> J : a
      B --> J : b
      J --> [*]`
    expect(JSON.stringify(exported(text))).toBe(JSON.stringify(exported(text)))
  })
})
