import { describe, expect, it } from 'vitest'

import { containsWebAddress, defaultConventions, pageOf, subjectMode } from './assistant-subject'

describe('containsWebAddress', () => {
  it('finds an http or https address anywhere in the message', () => {
    expect(containsWebAddress('Rules from https://example.com/guide please')).toBe(true)
    expect(containsWebAddress('HTTP://EXAMPLE.COM')).toBe(true)
    expect(containsWebAddress('see\nhttp://example.com')).toBe(true)
  })

  it('ignores a message without one', () => {
    expect(containsWebAddress('')).toBe(false)
    expect(containsWebAddress('example.com and ftp://example.com')).toBe(false)
    expect(containsWebAddress('the https:// prefix alone')).toBe(false)
    expect(containsWebAddress('nothttps://example.com')).toBe(false)
  })
})

describe('defaultConventions', () => {
  const configs = [
    { id: 1, projectId: null },
    { id: 2, projectId: 10 },
    { id: 3, projectId: 20 },
  ]

  it('takes the conventions of the page first', () => {
    expect(defaultConventions({ pageConfigId: 3, projectId: 10, configs })).toBe(3)
  })

  it('then the conventions of the project', () => {
    expect(defaultConventions({ pageConfigId: null, projectId: 10, configs })).toBe(2)
  })

  it('has none without a page or a project that holds some', () => {
    expect(defaultConventions({ pageConfigId: null, projectId: null, configs })).toBeNull()
    expect(defaultConventions({ pageConfigId: null, projectId: 30, configs })).toBeNull()
  })

  it('never reads "outside any project" as a project', () => {
    expect(defaultConventions({ pageConfigId: null, projectId: null, configs })).not.toBe(1)
  })
})

describe('subjectMode', () => {
  const offered = { autoOffered: true, webOffered: true, onArchitecture: false }

  it('starts on Auto when it is offered', () => {
    expect(subjectMode({ ...offered, wanted: null })).toBe('auto')
  })

  it('starts on the architecture of the page, even with Auto offered', () => {
    expect(subjectMode({ ...offered, onArchitecture: true, wanted: null })).toBe('architecture')
    expect(subjectMode({ ...offered, onArchitecture: true, wanted: 'auto' })).toBe('auto')
  })

  it('starts on nothing without Auto', () => {
    expect(subjectMode({ ...offered, autoOffered: false, wanted: null })).toBe('none')
  })

  it('keeps what the owner chose', () => {
    expect(subjectMode({ ...offered, wanted: 'none' })).toBe('none')
    expect(subjectMode({ ...offered, wanted: 'web' })).toBe('web')
    expect(subjectMode({ ...offered, wanted: 'architecture' })).toBe('architecture')
  })

  it('falls back to the start when the choice is no longer offered', () => {
    expect(subjectMode({ ...offered, autoOffered: false, wanted: 'auto' })).toBe('none')
    expect(subjectMode({ ...offered, webOffered: false, wanted: 'web' })).toBe('auto')
    expect(
      subjectMode({ autoOffered: false, webOffered: false, onArchitecture: true, wanted: 'auto' }),
    ).toBe('architecture')
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
