import { describe, expect, it } from 'vitest'
import { formatDiagramText, parseDiagramText, type StateDiagram, type UmlSpec } from './index.ts'

function read(text: string, format: 'mermaid' | 'plantuml' = 'mermaid') {
  const result = parseDiagramText(text, format)
  if (result.diagram?.kind !== 'state') throw new Error('not a state diagram')
  return { diagram: result.diagram, problems: result.problems }
}

/** PlantUML writes transitions between states after every block, so their order is not kept. */
const sorted = (d: StateDiagram) => ({
  ...d,
  transitions: [...d.transitions].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b)),
  ),
})

const regionOf = (d: StateDiagram) =>
  Object.fromEntries(d.states.map((s) => [s.id, [s.parent, s.region]]))

const TWO = `stateDiagram-v2
  state Active {
    [*] --> NumLockOff
    NumLockOff --> NumLockOn : press
    --
    [*] --> CapsLockOff
    CapsLockOff --> CapsLockOn : press
    CapsLockOn --> [*]
  }
  [*] --> Active`

const NESTED = `stateDiagram-v2
  state Outer {
    state Left {
      [*] --> L1
      --
      [*] --> L2
    }
    --
    state Right {
      R1
      --
      R2
      --
      R3
    }
  }`

describe('concurrent regions of a composite state', () => {
  it('reads two regions, each with its own [*] start and end', () => {
    const { diagram, problems } = read(TWO)
    expect(problems).toEqual([])
    expect(regionOf(diagram)).toEqual({
      Active: [undefined, undefined],
      NumLockOff: ['Active', undefined],
      NumLockOn: ['Active', undefined],
      CapsLockOff: ['Active', 1],
      CapsLockOn: ['Active', 1],
    })
    expect(diagram.states.find((s) => s.id === 'NumLockOff')).not.toHaveProperty('region')
    expect(diagram.transitions.filter((t) => t.parent === 'Active')).toHaveLength(3)
  })

  it('reads three regions and nested composites with their own regions', () => {
    const { diagram, problems } = read(NESTED)
    expect(problems).toEqual([])
    expect(regionOf(diagram)).toEqual({
      Outer: [undefined, undefined],
      Left: ['Outer', undefined],
      L1: ['Left', undefined],
      L2: ['Left', 1],
      Right: ['Outer', 1],
      R1: ['Right', undefined],
      R2: ['Right', 1],
      R3: ['Right', 2],
    })
  })

  it('keeps a state where it was first seen', () => {
    const { diagram } = read(`stateDiagram-v2
  state S {
    A --> B
    --
    C --> A
  }`)
    expect(regionOf(diagram)).toMatchObject({ A: ['S', undefined], C: ['S', 1] })
  })

  it('still reports -- outside a composite state', () => {
    const { problems } = read('stateDiagram-v2\n  A --> B\n  --\n  B --> A')
    expect(problems).toMatchObject([{ code: 'unsupported', severity: 'warning', line: 3 }])
  })

  it('writes each region in its block, separated by --', () => {
    expect(formatDiagramText(read(TWO).diagram, 'mermaid')).toBe(`stateDiagram-v2
  state Active {
    NumLockOff
    NumLockOn
    [*] --> NumLockOff
    NumLockOff --> NumLockOn : press
    --
    CapsLockOff
    CapsLockOn
    [*] --> CapsLockOff
    CapsLockOff --> CapsLockOn : press
    CapsLockOn --> [*]
  }
  [*] --> Active`)
  })

  it.each([TWO, NESTED])('round-trips through Mermaid and PlantUML', (text) => {
    const model = read(text).diagram
    for (const format of ['mermaid', 'plantuml'] as const) {
      const back = read(formatDiagramText(model, format), format)
      expect(back.problems).toEqual([])
      expect(sorted(back.diagram)).toEqual(sorted(model))
    }
  })

  it('writes PlantUML regions with -- and reads || as a separator too', () => {
    const plantuml = formatDiagramText(read(TWO).diagram, 'plantuml')
    expect(plantuml).toContain('\n  --\n')
    const bars = read(plantuml.replace('\n  --\n', '\n  ||\n'), 'plantuml')
    expect(bars.problems).toEqual([])
    expect(sorted(bars.diagram)).toEqual(sorted(read(TWO).diagram))
  })

  it('closes up empty regions when writing', () => {
    const gaps: UmlSpec = {
      kind: 'state',
      states: [
        { id: 'S' },
        { id: 'A', parent: 'S', region: 2 },
        { id: 'B', parent: 'S', region: 5 },
      ],
      transitions: [],
    }
    expect(regionOf(read(formatDiagramText(gaps, 'mermaid')).diagram)).toMatchObject({
      A: ['S', undefined],
      B: ['S', 1],
    })
  })

  it('writes a diagram without regions as before', () => {
    const plain: UmlSpec = {
      kind: 'state',
      states: [{ id: 'Idle' }, { id: 'Run' }, { id: 'Step', parent: 'Run' }],
      transitions: [
        { from: '[*]', to: 'Idle' },
        { from: 'Idle', to: 'Run', label: 'go' },
        { from: '[*]', to: 'Step', parent: 'Run' },
      ],
    }
    expect(formatDiagramText(plain, 'mermaid')).toBe(`stateDiagram-v2
  Idle
  state Run {
    Step
    [*] --> Step
  }
  [*] --> Idle
  Idle --> Run : go`)
    expect(formatDiagramText(plain, 'plantuml')).toBe(`@startuml
state Idle
state Run {
  state Step
  [*] --> Step
}
[*] --> Idle
Idle --> Run : go
@enduml`)
  })
})
