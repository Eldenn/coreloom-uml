import { describe, expect, it } from 'vitest'

import {
  addItem,
  ASSISTANT_CONTEXT_MAX,
  pageOf,
  sentContext,
  subjectOf,
  workspaceItems,
} from './assistant-subject'

describe('addItem', () => {
  const shop = { kind: 'architecture', id: 1, label: 'Shop' } as const
  const rules = { kind: 'agent-config', id: 1, label: 'Rules' } as const

  it('holds each item once, whatever its label', () => {
    const items = addItem(addItem([], shop, true), rules, true)
    expect(items).toEqual([shop, rules])
    expect(addItem(items, { ...shop, label: 'Renamed' }, true)).toBe(items)
  })

  it('stops at the most the API takes', () => {
    const full = Array.from({ length: ASSISTANT_CONTEXT_MAX }, (_, id) => ({ ...shop, id }))
    expect(addItem(full, { ...shop, id: 99 }, true)).toBe(full)
  })

  it('holds one architecture and nothing else without "Auto"', () => {
    const other = { ...shop, id: 2 }
    expect(addItem([shop], other, false)).toEqual([other])
    expect(addItem([shop], rules, false)).toEqual([shop])
  })
})

describe('subjectOf', () => {
  const shop = { kind: 'architecture', id: 1, label: 'Shop' } as const
  const rules = { kind: 'agent-config', id: 4, label: 'Rules' } as const
  const nowhere = { pageArchitectureId: null, autoOffered: true }

  it('sends one architecture alone straight to its diagrams', () => {
    expect(subjectOf({ ...nowhere, items: [shop] })).toEqual({
      mode: 'architecture',
      architectureId: 1,
    })
  })

  it("sends an empty context to the page's architecture, else to Auto", () => {
    expect(subjectOf({ ...nowhere, items: [], pageArchitectureId: 7 })).toEqual({
      mode: 'architecture',
      architectureId: 7,
    })
    expect(subjectOf({ ...nowhere, items: [] })).toEqual({ mode: 'auto' })
  })

  it("lets Auto read several items, on an architecture's page too", () => {
    expect(subjectOf({ ...nowhere, items: [shop, rules], pageArchitectureId: 7 })).toEqual({
      mode: 'auto',
    })
    expect(subjectOf({ ...nowhere, items: [rules] })).toEqual({ mode: 'auto' })
  })

  it('reads the first architecture, else nothing, without Auto', () => {
    const manual = { pageArchitectureId: null, autoOffered: false }
    expect(subjectOf({ ...manual, items: [rules, shop] })).toEqual({
      mode: 'architecture',
      architectureId: 1,
    })
    expect(subjectOf({ ...manual, items: [] })).toEqual({ mode: 'none' })
  })
})

describe('pageOf', () => {
  it('names the page the panel is on', () => {
    expect(pageOf({ architectureId: 4 })).toEqual({ kind: 'architecture', id: 4 })
    expect(pageOf({ configId: 5 })).toEqual({ kind: 'agent-config', id: 5 })
    expect(pageOf({ projectId: 6 })).toEqual({ kind: 'project', id: 6 })
  })

  it('names none elsewhere', () => {
    expect(pageOf({})).toBeUndefined()
    expect(pageOf({ configId: null, projectId: null })).toBeUndefined()
  })
})

describe('views and parts of views', () => {
  const shop = { kind: 'architecture', id: 1, label: 'Shop' } as const
  const classes = { kind: 'view', id: 10, architectureId: 1, label: 'Classes' } as const
  const total = {
    kind: 'element',
    viewId: 11,
    architectureId: 1,
    type: 'member',
    label: 'Order.total',
  } as const
  const elsewhere = { kind: 'view', id: 20, architectureId: 2, label: 'Other' } as const
  const here = { pageArchitectureId: null, autoOffered: true }

  it('holds a part once per view, type and label', () => {
    const items = addItem([total], { ...total }, true)
    expect(items).toEqual([total])
    expect(addItem(items, { ...total, viewId: 12 }, true)).toHaveLength(2)
  })

  it('sends views and parts of one architecture to its diagrams, naming their views', () => {
    expect(
      subjectOf({ ...here, items: [classes, total, { ...total, label: 'Order.id' }] }),
    ).toEqual({ mode: 'architecture', architectureId: 1, diagramIds: [10, 11] })
    // The architecture itself is in the context: all of its views.
    expect(subjectOf({ ...here, items: [shop, classes] })).toEqual({
      mode: 'architecture',
      architectureId: 1,
    })
  })

  it('leaves views of two architectures to Auto', () => {
    expect(subjectOf({ ...here, items: [classes, elsewhere] })).toEqual({ mode: 'auto' })
  })

  it('keeps to one architecture without Auto', () => {
    expect(addItem([classes], total, false)).toEqual([classes, total])
    expect(addItem([classes], elsewhere, false)).toEqual([elsewhere])
    expect(subjectOf({ pageArchitectureId: null, autoOffered: false, items: [total] })).toEqual({
      mode: 'architecture',
      architectureId: 1,
      diagramIds: [11],
    })
  })

  it('sends a part as pointed, with its view in what Auto reads', () => {
    expect(sentContext([shop, classes, total, { ...total, label: 'Order.id' }])).toEqual({
      context: [
        { kind: 'architecture', id: 1 },
        { kind: 'view', id: 10 },
        { kind: 'view', id: 11 },
      ],
      pointed: [
        { diagramId: 11, type: 'member', label: 'Order.total' },
        { diagramId: 11, type: 'member', label: 'Order.id' },
      ],
    })
  })
})

it('several selected parts are one item each, the ones that read the same once', () => {
  const items = workspaceItems(
    {
      type: 'selection',
      viewId: '7',
      targets: [
        { type: 'element', label: 'Order' },
        { type: 'relation', label: 'Order → Payment: pays' },
        { type: 'element', label: 'Order' },
      ],
    },
    7,
    3,
  )
  expect(items).toEqual([
    { kind: 'element', viewId: 7, architectureId: 3, type: 'element', label: 'Order' },
    {
      kind: 'element',
      viewId: 7,
      architectureId: 3,
      type: 'relation',
      label: 'Order → Payment: pays',
    },
  ])
  expect(workspaceItems({ type: 'view', viewId: '7', label: 'Classes' }, 7, 3)).toEqual([
    { kind: 'view', id: 7, architectureId: 3, label: 'Classes' },
  ])
})
