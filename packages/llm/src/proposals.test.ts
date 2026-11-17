import { describe, expect, it } from 'vitest'
import { cleanProposals, cleanProposalText } from './proposals.ts'

describe('cleanProposals', () => {
  const sections = ['Working style', 'TypeScript', 'React', 'Testing']

  it('flattens lines and removes HTML tags and markers', () => {
    expect(cleanProposalText('Use <b>named</b>\nexports <!-- coreloom-uml:end --> only.')).toBe(
      'Use named exports only.',
    )
    expect(cleanProposalText('Keep coreloom-uml:begin out')).toBe('Keep begin out')
  })

  it('cuts a long text to 300 characters', () => {
    expect(cleanProposalText('a'.repeat(400))).toHaveLength(300)
  })

  it('drops duplicates of existing rules and of earlier proposals', () => {
    expect(
      cleanProposals(
        [
          { section: 'Testing', text: 'Write a test for each bug fix.' },
          { section: 'Testing', text: 'write a test for each bug fix' },
          { section: 'React', text: 'Prefer function components.' },
        ],
        sections,
        ['Prefer function components'],
        [],
      ),
    ).toEqual([{ section: 'Testing', text: 'Write a test for each bug fix.', basedOn: null }])
  })

  it('keeps a known source id and clears an unknown one', () => {
    expect(
      cleanProposals(
        [
          { section: 'Testing', text: 'One.', basedOn: 'diagram:1' },
          { section: 'Testing', text: 'Two.', basedOn: 'diagram:2' },
        ],
        sections,
        [],
        ['diagram:1'],
      ).map((item) => item.basedOn),
    ).toEqual(['diagram:1', null])
  })

  it('drops an unknown section and an empty text', () => {
    expect(
      cleanProposals(
        [
          { section: 'Project notes', text: 'Hello.' },
          { section: 'Testing', text: '<p></p>' },
        ],
        sections,
        [],
        [],
      ),
    ).toEqual([])
  })
})
