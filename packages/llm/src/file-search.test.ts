import { describe, expect, it } from 'vitest'
import { findPassages, queryWords } from './file-search.ts'

describe('queryWords', () => {
  it('keeps distinct words of three letters or more, folded', () => {
    expect(queryWords('Le Système de facturation, LE système!')).toEqual(['systeme', 'facturation'])
  })
})

describe('findPassages', () => {
  const filler = (n: number) => `${'lorem ipsum dolor '.repeat(5)}${String(n)}\n`
  const text = [
    ...Array.from({ length: 10 }, (_, n) => filler(n)),
    'The billing service sends the invoices.\n',
    ...Array.from({ length: 10 }, (_, n) => filler(n)),
    'Billing only.\n',
  ].join('')

  it('ranks the passage holding more of the rarer words first, with its offsets', () => {
    const found = findPassages([{ id: 7, text }], 'Which service sends Invoices for billing?', {
      limit: 5,
      length: 200,
    })
    expect(found.length).toBeGreaterThanOrEqual(2)
    const [best] = found
    expect(best?.id).toBe(7)
    expect(text.slice(best?.start, best?.end)).toContain('sends the invoices')
    expect(found.every((passage) => passage.end - passage.start <= 200)).toBe(true)
  })

  it('searches several files, finds accented words unaccented, answers at most the limit', () => {
    const found = findPassages(
      [
        { id: 1, text: 'Rien ici.\n' },
        { id: 2, text: 'La facturation est gérée par le service Été.\n' },
      ],
      'ete facturation',
      { limit: 1 },
    )
    expect(found).toEqual([expect.objectContaining({ id: 2, start: 0 })])
  })

  it('answers nothing for a query without words or without a match', () => {
    expect(findPassages([{ id: 1, text }], 'a b', { limit: 3 })).toEqual([])
    expect(findPassages([{ id: 1, text }], 'kubernetes', { limit: 3 })).toEqual([])
  })
})
