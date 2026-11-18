import { describe, expect, it } from 'vitest'

import { containsWebAddress, defaultConventions } from './assistant-subject'

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
