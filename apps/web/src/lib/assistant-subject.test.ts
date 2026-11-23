import { describe, expect, it } from 'vitest'

import { addItem, ASSISTANT_CONTEXT_MAX, pageOf, subjectOf } from './assistant-subject'

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
  const shop = { kind: 'architecture', id: 1 } as const
  const rules = { kind: 'agent-config', id: 4 } as const
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
